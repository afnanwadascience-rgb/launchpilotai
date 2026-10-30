import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  usageRecord: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  subscription: { upsert: vi.fn() }
}));
const transaction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db: { $transaction: transaction } }));
vi.mock('@/lib/billing', () => ({
  generationLimit: (plan: 'FREE' | 'PRO') => plan === 'PRO' ? 100 : 3,
  proIsActive: (subscription: { plan: string; status: string; currentPeriodEnd?: Date | null }) => subscription.plan === 'PRO' && ['ACTIVE', 'TRIALING'].includes(subscription.status) && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date())
}));
import { reserveGeneration } from '@/lib/usage';

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (callback: (arg: typeof tx) => unknown) => callback(tx));
  tx.usageRecord.findUnique.mockResolvedValue(null);
  tx.usageRecord.count.mockResolvedValue(0);
  tx.usageRecord.create.mockResolvedValue({ id: 'usage_1' });
  tx.usageRecord.update.mockResolvedValue({ id: 'usage_1' });
  tx.subscription.upsert.mockResolvedValue({ plan: 'FREE', status: 'FREE', currentPeriodEnd: null, currentPeriodStart: null });
});

describe('generation usage reservation', () => {
  it('reserves one generation when quota remains', async () => {
    await expect(reserveGeneration('user_1', 'req-key-0001', 'idea-validator')).resolves.toMatchObject({ mode: 'reserved', plan: 'FREE', limit: 3, used: 0 });
    expect(tx.usageRecord.create).toHaveBeenCalledWith({ data: { userId: 'user_1', requestKey: 'req-key-0001', category: 'idea-validator', status: 'PENDING' } });
  });
  it('blocks the fourth Free generation and does not create a reservation', async () => {
    tx.usageRecord.count.mockResolvedValue(3);
    await expect(reserveGeneration('user_1', 'req-key-0004', 'idea-validator')).resolves.toMatchObject({ mode: 'limit', plan: 'FREE', limit: 3 });
    expect(tx.usageRecord.create).not.toHaveBeenCalled();
  });
  it('returns the cached response for a repeated successful idempotency key', async () => {
    tx.usageRecord.findUnique.mockResolvedValue({ status: 'COMPLETE', response: { result: 'saved output' } });
    await expect(reserveGeneration('user_1', 'req-key-0001', 'idea-validator')).resolves.toEqual({ mode: 'cached', response: { result: 'saved output' } });
    expect(tx.usageRecord.count).not.toHaveBeenCalled();
    expect(tx.usageRecord.create).not.toHaveBeenCalled();
  });
  it('applies Pro monthly quota separately from the Free lifetime allowance', async () => {
    tx.subscription.upsert.mockResolvedValue({ plan: 'PRO', status: 'ACTIVE', currentPeriodEnd: null, currentPeriodStart: new Date(Date.now() - 60_000) });
    tx.usageRecord.count.mockResolvedValue(99);
    await expect(reserveGeneration('user_1', 'req-key-0099', 'marketing-kit')).resolves.toMatchObject({ mode: 'reserved', plan: 'PRO', limit: 100, used: 99 });
  });
});
