import { requireApiUser } from '../../lib/auth.js';
import { proIsActive } from '../../lib/billing.js';
import { db } from '../../lib/db.js';
import { assertSameOrigin, jsonError } from '../../lib/http.js';
import { createPaddleCheckoutTransaction } from '../../lib/paddle.js';
import { consumeRateLimit } from '../../lib/rate-limit.js';

export const runtime = 'nodejs';
export const maxDuration = 20;

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  if (!(await consumeRateLimit(`paddle-checkout:${user.id}`, 5, 60 * 60 * 1000))) {
    return jsonError('Too many checkout attempts. Please try again later.', 429);
  }

  try {
    const current = await db.subscription.findUnique({
      where: { userId: user.id },
      select: { plan: true, status: true, currentPeriodEnd: true },
    });
    if (proIsActive(current)) {
      return jsonError('Your account already has an active Pro subscription. Manage or cancel it before starting another subscription.', 409, 'PRO_ALREADY_ACTIVE');
    }

    const transactionId = await createPaddleCheckoutTransaction(user.id);
    return Response.json({ ok: true, transactionId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PADDLE_NOT_CONFIGURED') {
      return jsonError('Paddle is not configured yet. Add PADDLE_API_KEY and PADDLE_PRO_PRICE_ID in the server environment.', 503, code);
    }
    if (code === 'PADDLE_PRICE_ID_INVALID') return jsonError('The configured Paddle Pro price ID is invalid.', 503, code);
    if (code === 'PADDLE_ENVIRONMENT_MISMATCH') return jsonError('The Paddle API key does not match PADDLE_ENVIRONMENT. Use a sandbox key for sandbox or a live key for production.', 503, code);
    if (code === 'PADDLE_API_ERROR') return jsonError('Paddle could not create checkout. Check your product price, API-key permissions, and sandbox/live environment.', 502, code);
    console.error('paddle_checkout_failed', code || 'unknown');
    return jsonError('Paddle checkout could not be started. Please try again later.', 502, 'PADDLE_CHECKOUT_FAILED');
  }
}
