import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create, findUnique, update } = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { webhookEvent: { create, findUnique, update, deleteMany: vi.fn() } } }));
import { claimWebhookEvent, markWebhookEventProcessed } from '@/lib/webhook-events';

beforeEach(() => { create.mockReset(); findUnique.mockReset(); update.mockReset(); });
describe('webhook event idempotency', () => {
  it('claims a new event once', async () => {
    create.mockResolvedValue({ id: 'evt_1' });
    await expect(claimWebhookEvent('evt_1', 'membership.activated', { data: { id: 'mem_12345' } })).resolves.toBe('claimed');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('recognizes a processed duplicate delivery', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue({ processedAt: new Date() });
    await expect(claimWebhookEvent('evt_1', 'membership.activated', {})).resolves.toBe('duplicate');
  });
  it('allows an event without processedAt to be retried', async () => {
    create.mockRejectedValue({ code: 'P2002' });
    findUnique.mockResolvedValue({ processedAt: null });
    await expect(claimWebhookEvent('evt_1', 'membership.activated', {})).resolves.toBe('retry');
  });
  it('marks claimed events processed', async () => {
    update.mockResolvedValue({ id: 'evt_1', processedAt: new Date() });
    await markWebhookEventProcessed('evt_1');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'evt_1' }, data: expect.objectContaining({ processedAt: expect.any(Date) }) }));
  });
});
