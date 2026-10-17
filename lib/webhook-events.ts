import { Prisma } from '@prisma/client';
import { db } from './db';

export type WebhookClaim = 'claimed' | 'duplicate' | 'retry';
export async function claimWebhookEvent(id: string, eventType: string, payload: Record<string, unknown>): Promise<WebhookClaim> {
  try {
    await db.webhookEvent.create({ data: { id: id.slice(0, 190), eventType: eventType.slice(0, 120) || 'unknown', payload: payload as Prisma.InputJsonValue } });
    return 'claimed';
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error;
    const previous = await db.webhookEvent.findUnique({ where: { id: id.slice(0, 190) }, select: { processedAt: true } });
    return previous?.processedAt ? 'duplicate' : 'retry';
  }
}

export async function markWebhookEventProcessed(id: string) {
  return db.webhookEvent.update({ where: { id: id.slice(0, 190) }, data: { processedAt: new Date() } });
}

export async function releaseUnprocessedWebhookEvent(id: string) {
  return db.webhookEvent.deleteMany({ where: { id: id.slice(0, 190), processedAt: null } });
}
