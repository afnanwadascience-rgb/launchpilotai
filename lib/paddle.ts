import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { proIsActive } from './billing.js';

export type PaddleEnvironment = 'sandbox' | 'production';

export function getPaddleEnvironment(): PaddleEnvironment {
  return process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase() === 'production'
    ? 'production'
    : 'sandbox';
}

function paddleApiBase(): string {
  return getPaddleEnvironment() === 'sandbox'
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com';
}

export function paddleIsConfigured(): boolean {
  return Boolean(
    process.env.PADDLE_API_KEY?.trim() &&
    process.env.PADDLE_PRO_PRICE_ID?.trim() &&
    process.env.PADDLE_WEBHOOK_SECRET?.trim()
  );
}

/** Create a server-owned transaction and bind it to an opaque server-side checkout intent. */
export async function createPaddleCheckoutTransaction(userId: string): Promise<string> {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  const priceId = process.env.PADDLE_PRO_PRICE_ID?.trim();
  if (!apiKey || !priceId) throw new Error('PADDLE_NOT_CONFIGURED');
  if (!/^pri_[a-z0-9]{10,40}$/i.test(priceId)) throw new Error('PADDLE_PRICE_ID_INVALID');

  const environment = getPaddleEnvironment();
  if (environment === 'sandbox' && apiKey.startsWith('pdl_live_')) throw new Error('PADDLE_ENVIRONMENT_MISMATCH');
  if (environment === 'production' && apiKey.startsWith('pdl_sdbx_')) throw new Error('PADDLE_ENVIRONMENT_MISMATCH');

  // The buyer can alter checkout custom data in the browser, so do not put a user ID there.
  // A random token is bound to the user in the database, and only its hash is stored.
  const checkoutToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(checkoutToken).digest('hex');
  const intent = await db.paddleCheckoutIntent.create({
    data: { tokenHash, userId, priceId },
    select: { id: true },
  });

  try {
    const response = await fetch(`${paddleApiBase()}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        collection_mode: 'automatic',
        custom_data: {
          launchpilot_checkout_token: checkoutToken,
          launchpilot_plan: 'PRO',
          launchpilot_app: 'LaunchPilot AI',
        },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    });

    const result = await response.json().catch(() => null) as {
      data?: { id?: string; status?: string };
      error?: { code?: string; detail?: string; message?: string };
    } | null;

    if (!response.ok) {
      // Never log request headers, API keys, or the full response body.
      console.error('paddle_transaction_create_failed', { status: response.status, code: result?.error?.code || 'UNKNOWN' });
      throw new Error('PADDLE_API_ERROR');
    }
    const transactionId = result?.data?.id;
    if (!transactionId || !/^txn_[a-z0-9]{10,40}$/i.test(transactionId)) {
      throw new Error('PADDLE_TRANSACTION_INVALID');
    }
    await db.paddleCheckoutIntent.update({ where: { id: intent.id }, data: { transactionId } });
    return transactionId;
  } catch (error) {
    await db.paddleCheckoutIntent.deleteMany({ where: { id: intent.id, transactionId: null } }).catch(() => undefined);
    throw error;
  }
}

/** Verify the original request bytes using Paddle's documented HMAC-SHA256 format. */
export function verifyPaddleWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret = process.env.PADDLE_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signatureHeader || rawBody.length === 0) return false;

  const parts = signatureHeader.split(';').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 'ts')?.[1];
  const signatures = parts.filter(([key, value]) => key === 'h1' && Boolean(value)).map(([, value]) => value);
  if (!timestamp || !/^\d{1,15}$/.test(timestamp) || signatures.length === 0) return false;
  const timestampNumber = Number(timestamp);
  // Five-minute tolerance helps with delivery delays while limiting replay exposure.
  if (!Number.isSafeInteger(timestampNumber) || Math.abs(nowSeconds - timestampNumber) > 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`, 'utf8').digest();
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Apply a verified Paddle subscription lifecycle event to the user's single subscription row. */
export async function syncPaddleSubscription(data: Record<string, unknown>): Promise<boolean> {
  const subscriptionId = typeof data.id === 'string' ? data.id : '';
  const configuredPriceId = process.env.PADDLE_PRO_PRICE_ID?.trim();
  const customData = asRecord(data.custom_data);
  const checkoutToken = typeof customData?.launchpilot_checkout_token === 'string' ? customData.launchpilot_checkout_token : '';
  if (!/^sub_[a-z0-9]{10,40}$/i.test(subscriptionId) || !configuredPriceId || !/^[a-f0-9]{64}$/i.test(checkoutToken)) return false;
  const tokenHash = createHash('sha256').update(checkoutToken).digest('hex');
  const intent = await db.paddleCheckoutIntent.findUnique({ where: { tokenHash } });
  if (!intent || !intent.transactionId || intent.priceId !== configuredPriceId) return false;
  if (intent.paddleSubscriptionId && intent.paddleSubscriptionId !== subscriptionId) return false;
  const userId = intent.userId;

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const itemPriceIds = rawItems.map((item) => {
    const record = asRecord(item);
    const price = asRecord(record?.price);
    return typeof price?.id === 'string' ? price.id : typeof record?.price_id === 'string' ? record.price_id : '';
  });
  if (!itemPriceIds.includes(configuredPriceId)) return false;

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return false;

  const statusRaw = typeof data.status === 'string' ? data.status.toLowerCase() : 'unknown';
  const currentPeriod = asRecord(data.current_billing_period);
  const periodStart = validDate(currentPeriod?.starts_at);
  const periodEnd = validDate(currentPeriod?.ends_at);
  const scheduledChange = asRecord(data.scheduled_change);
  const cancelAtPeriodEnd = scheduledChange?.action === 'cancel';
  const isCurrentAndPaid = ['active', 'trialing'].includes(statusRaw) && Boolean(periodEnd && periodEnd > new Date());
  const plan: 'FREE' | 'PRO' = isCurrentAndPaid ? 'PRO' : 'FREE';
  const status = isCurrentAndPaid ? (statusRaw === 'trialing' ? 'TRIALING' : 'ACTIVE') : statusRaw.toUpperCase().slice(0, 30) || 'INACTIVE';
  const customerId = typeof data.customer_id === 'string' ? data.customer_id : null;

  const existing = await db.subscription.findUnique({
    where: { userId: user.id },
    select: { billingProvider: true, plan: true, status: true, currentPeriodEnd: true, paddleSubscriptionId: true, whopMembershipId: true },
  });
  // Never let an unrelated/older provider's event take over a currently active paid account.
  if (existing && (existing.billingProvider === 'WHOP' || (!existing.billingProvider && existing.whopMembershipId)) && proIsActive(existing)) return true;
  // Ignore stale events for an older Paddle subscription after a newer one is active.
  if (existing && existing.billingProvider === 'PADDLE' && existing.paddleSubscriptionId && existing.paddleSubscriptionId !== subscriptionId && proIsActive(existing)) return true;

  // Atomically bind this one-time intent to at most one Paddle subscription ID.
  if (!intent.paddleSubscriptionId) {
    const claimed = await db.paddleCheckoutIntent.updateMany({
      where: { id: intent.id, paddleSubscriptionId: null },
      data: { paddleSubscriptionId: subscriptionId },
    });
    if (claimed.count === 0) {
      const latestIntent = await db.paddleCheckoutIntent.findUnique({ where: { id: intent.id }, select: { paddleSubscriptionId: true } });
      if (latestIntent?.paddleSubscriptionId !== subscriptionId) return false;
    }
  }

  await db.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      billingProvider: 'PADDLE',
      plan,
      status,
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: customerId,
      paddlePriceId: configuredPriceId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
      lastVerifiedAt: new Date(),
    },
    update: {
      billingProvider: 'PADDLE',
      plan,
      status,
      whopMembershipId: null,
      whopProductId: null,
      whopPlanId: null,
      paddleSubscriptionId: subscriptionId,
      paddleCustomerId: customerId,
      paddlePriceId: configuredPriceId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
      lastVerifiedAt: new Date(),
    },
  });
  await db.paddleCheckoutIntent.update({
    where: { id: intent.id },
    data: { paddleSubscriptionId: subscriptionId, completedAt: new Date() },
  });
  return true;
}
