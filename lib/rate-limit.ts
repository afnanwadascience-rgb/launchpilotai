import { db } from './db.js';

/** Database-backed fixed-window limiter suitable for horizontally scaled deployments. */
export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const start = new Date(now.getTime() - windowMs);
  return db.$transaction(async (tx) => {
    const row = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!row || row.windowStartedAt < start) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, windowStartedAt: now },
        update: { count: 1, windowStartedAt: now }
      });
      return true;
    }
    if (row.count >= limit) return false;
    await tx.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return true;
  }, { isolationLevel: 'Serializable' }).catch((error: unknown) => {
    // Fail closed when rate limiting cannot be enforced in production.
    if (process.env.NODE_ENV === 'production') throw error;
    return true;
  });
}
