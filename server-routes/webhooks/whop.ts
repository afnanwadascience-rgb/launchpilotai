import { createHash } from 'node:crypto';
import { db } from '../../lib/db.js';
import { claimWebhookEvent, markWebhookEventProcessed, releaseUnprocessedWebhookEvent } from '../../lib/webhook-events.js';
import { fetchWhopMembership, syncMembershipForEmail, verifyWhopWebhook } from '../../lib/billing.js';
import { jsonError } from '../../lib/http.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

function recordValue(record: Record<string, unknown> | undefined, key: string): unknown {
  return record && typeof record === 'object' ? record[key] : undefined;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 100_000) return jsonError('Webhook payload is too large.', 413);
  if (!verifyWhopWebhook(rawBody, request.headers)) return jsonError('Webhook signature could not be verified.', 401);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return jsonError('Webhook payload is not valid JSON.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('Webhook payload shape is not valid.', 400);
  const payload = body as Record<string, unknown>;
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : payload.resource && typeof payload.resource === 'object' ? payload.resource : payload) as Record<string, unknown>;
  const eventType = String(payload.type || payload.event_type || payload.event || '').slice(0, 120);
  const eventId = request.headers.get('webhook-id') || String(payload.id || payload.event_id || '') || createHash('sha256').update(rawBody).digest('hex');
  const membershipId = String(
    data.id && String(data.id).startsWith('mem_') ? data.id :
    recordValue(data.membership as Record<string, unknown> | undefined, 'id') ||
    recordValue(data, 'membership_id') ||
    recordValue(payload.membership as Record<string, unknown> | undefined, 'id') ||
    payload.membership_id || ''
  );
  try {
    const claim = await claimWebhookEvent(eventId, eventType || 'unknown', payload);
    if (claim === 'duplicate') return Response.json({ ok: true, duplicate: true });

    const membershipSignal = eventType.startsWith('membership.') || eventType === 'payment.succeeded' || eventType === 'payment.failed';
    if (membershipSignal && membershipId.startsWith('mem_')) {
      try {
        const membership = await fetchWhopMembership(membershipId);
        const linked = await syncMembershipForEmail(membership);
        if (!linked) {
          // It may be another product's event. It is valid but must not affect LaunchPilot access.
        }
      } catch (error) {
        if (eventType === 'membership.deactivated' && (error instanceof Error && error.message === 'MEMBERSHIP_NOT_FOUND')) {
          await db.subscription.updateMany({ where: { whopMembershipId: membershipId }, data: { plan: 'FREE', status: 'INACTIVE', lastVerifiedAt: new Date() } });
        } else {
          await releaseUnprocessedWebhookEvent(eventId).catch(() => undefined);
          return jsonError('Membership verification was temporarily unavailable. Whop can retry this event.', 503);
        }
      }
    }
    await markWebhookEventProcessed(eventId);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('whop_webhook_failed', error instanceof Error ? error.message : 'unknown');
    return jsonError('Webhook processing failed. Whop can retry this event.', 503);
  }
}
