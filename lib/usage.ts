import { Prisma } from '@prisma/client';
import { db } from './db';
import { generationLimit, proIsActive } from './billing';

export type PlanContext = { plan: 'FREE' | 'PRO'; status: string; used: number; limit: number; remaining: number; resetsAt: Date | null };

export async function getPlanContext(userId: string): Promise<PlanContext> {
  const subscription = await db.subscription.upsert({
    where: { userId }, create: { userId, plan: 'FREE', status: 'FREE' }, update: {},
    select: { plan: true, status: true, currentPeriodEnd: true, currentPeriodStart: true }
  });
  const pro = proIsActive(subscription);
  const plan: 'FREE' | 'PRO' = pro ? 'PRO' : 'FREE';
  const start = pro ? (subscription.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1)) : undefined;
  const used = await db.usageRecord.count({
    where: { userId, status: { in: ['PENDING', 'COMPLETE'] }, ...(start ? { createdAt: { gte: start } } : {}) }
  });
  const limit = generationLimit(plan);
  return { plan, status: subscription.status, used, limit, remaining: Math.max(0, limit - used), resetsAt: pro ? subscription.currentPeriodEnd : null };
}

export async function reserveGeneration(userId: string, requestKey: string, category: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.usageRecord.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
    if (existing?.status === 'COMPLETE') return { mode: 'cached' as const, response: existing.response };
    if (existing?.status === 'PENDING') return { mode: 'pending' as const };
    const subscription = await tx.subscription.upsert({
      where: { userId }, create: { userId, plan: 'FREE', status: 'FREE' }, update: {},
      select: { plan: true, status: true, currentPeriodEnd: true, currentPeriodStart: true }
    });
    const pro = proIsActive(subscription);
    const plan: 'FREE' | 'PRO' = pro ? 'PRO' : 'FREE';
    const limit = generationLimit(plan);
    const start = pro ? (subscription.currentPeriodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1)) : undefined;
    const used = await tx.usageRecord.count({
      where: { userId, status: { in: ['PENDING', 'COMPLETE'] }, ...(start ? { createdAt: { gte: start } } : {}) }
    });
    if (used >= limit) return { mode: 'limit' as const, limit, plan };
    if (existing) {
      await tx.usageRecord.update({ where: { id: existing.id }, data: { status: 'PENDING', response: Prisma.DbNull, category, completedAt: null, createdAt: new Date() } });
    } else {
      await tx.usageRecord.create({ data: { userId, requestKey, category, status: 'PENDING' } });
    }
    return { mode: 'reserved' as const, plan, limit, used };
  }, { isolationLevel: 'Serializable' });
}

export async function finalizeGeneration(userId: string, requestKey: string, response: Record<string, unknown>) {
  return db.usageRecord.update({
    where: { userId_requestKey: { userId, requestKey } },
    data: { status: 'COMPLETE', response: response as Prisma.InputJsonValue, completedAt: new Date() }
  });
}

export async function failGeneration(userId: string, requestKey: string) {
  await db.usageRecord.updateMany({ where: { userId, requestKey, status: 'PENDING' }, data: { status: 'FAILED' } });
}
