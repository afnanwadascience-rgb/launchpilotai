import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { loginSchema } from '../../lib/validators';
import { assertSameOrigin, getClientIp, jsonError, readJsonLimited } from '../../lib/http';
import { consumeRateLimit } from '../../lib/rate-limit';
import { db } from '../../lib/db';
import { createSession } from '../../lib/auth';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  try {
    const parsed = loginSchema.safeParse(await readJsonLimited(request, 8_000));
    if (!parsed.success) return jsonError('Enter a valid email and password.', 400);
    const { email, password } = parsed.data;
    const emailKey = createHash('sha256').update(email).digest('hex').slice(0, 32);
    const allowed = await consumeRateLimit(`login:${getClientIp(request)}:${emailKey}`, 8, 15 * 60 * 1000);
    if (!allowed) return jsonError('Too many sign-in attempts. Please wait and try again.', 429);
    const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, passwordHash: true, createdAt: true } });
    const matches = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !matches) return jsonError('Email or password is incorrect.', 401);
    const cookie = await createSession(user.id);
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    console.error('login_failed', error instanceof Error ? error.message : 'unknown');
    return jsonError('Sign-in is temporarily unavailable. Please try again.', 503);
  }
}
