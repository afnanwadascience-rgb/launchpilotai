import { createHmac, randomBytes } from 'node:crypto';
import { db } from './db';

const COOKIE = process.env.SESSION_COOKIE_NAME || 'lp_session';
const SESSION_TTL_DAYS = 30;
export type SafeUser = { id: string; email: string; name: string; createdAt: Date };

function sessionPepper(): string {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) throw new Error('SESSION_SECRET must be configured with at least 32 characters in production.');
  return secret || 'development-only-session-pepper-change-before-deploy';
}
export function hashToken(token: string): string { return createHmac('sha256', sessionPepper()).update(token).digest('hex'); }
function tokenFromRequest(request: Request): string | null {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === COOKIE) {
      const value = rest.join('=');
      if (!value || value.length > 200) return null;
      try { return decodeURIComponent(value); } catch { return null; }
    }
  }
  return null;
}
function cookieHeader(token: string, expiresAt?: Date): string {
  const bits = [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') bits.push('Secure');
  if (expiresAt) bits.push(`Expires=${expiresAt.toUTCString()}`);
  return bits.join('; ');
}
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return cookieHeader(token, expiresAt);
}
export async function deleteSession(request: Request): Promise<string> {
  const token = tokenFromRequest(request);
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  const clearing = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') clearing.push('Secure');
  return clearing.join('; ');
}
export async function getCurrentUser(request: Request): Promise<SafeUser | null> {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, select: { user: { select: { id: true, email: true, name: true, createdAt: true } }, expiresAt: true } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) { await db.session.deleteMany({ where: { tokenHash: hashToken(token) } }); return null; }
  return session.user;
}
export async function requireApiUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return { user: null, response: Response.json({ error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' }, { status: 401 }) };
  return { user, response: null };
}
export async function ensureSubscriptionRow(userId: string) {
  return db.subscription.upsert({ where: { userId }, create: { userId, plan: 'FREE', status: 'FREE' }, update: {} });
}
