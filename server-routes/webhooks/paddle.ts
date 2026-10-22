import { claimWebhookEvent, markWebhookEventProcessed, releaseUnprocessedWebhookEvent } from '../../lib/webhook-events.js';
import { jsonError } from '../../lib/http.js';
import { syncPaddleSubscription, verifyPaddleWebhook } from '../../lib/paddle.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 100_000) return jsonError('Webhook payload is too large.', 413);
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return jsonError('Paddle webhook verification is not configured.', 503, 'PADDLE_WEBHOOK_NOT_CONFIGURED');
  if (!verifyPaddleWebhook(rawBody, request.headers.get('Paddle-Signature'), secret)) {
    return jsonError('Webhook signature could not be verified.', 401);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return jsonError('Webhook payload shape is not valid.', 400);
    payload = parsed as Record<string, unknown>;
  } catch {
    return jsonError('Webhook payload is not valid JSON.', 400);
  }

  const eventType = typeof payload.event_type === 'string' ? payload.event_type.slice(0, 120) : '';
  const eventId = typeof payload.event_id === 'string' ? payload.event_id : '';
  if (!eventType || !eventId) return jsonError('Webhook event metadata is missing.', 400);
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : null;
  if (!data) return jsonError('Webhook event data is invalid.', 400);

  try {
    const claim = await claimWebhookEvent(eventId, eventType, payload);
    if (claim === 'duplicate') return Response.json({ ok: true, duplicate: true });

    if (eventType.startsWith('subscription.')) {
      await syncPaddleSubscription(data);
    }
    // A transaction.completed event intentionally does not grant Pro by itself;
    // subscription lifecycle events are the source of truth for recurring access.
    await markWebhookEventProcessed(eventId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('paddle_webhook_failed', error instanceof Error ? error.message : 'unknown');
    await releaseUnprocessedWebhookEvent(eventId).catch(() => undefined);
    return jsonError('Webhook processing failed. Paddle can retry this event.', 503);
  }
}
