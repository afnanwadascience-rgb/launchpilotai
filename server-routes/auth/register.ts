import bcrypt from 'bcryptjs';
import { registrationSchema } from '../../lib/validators.js';
import { assertSameOrigin, getClientIp, jsonError, readJsonLimited } from '../../lib/http.js';
import { consumeRateLimit } from '../../lib/rate-limit.js';
import { db } from '../../lib/db.js';
import { createSession } from '../../lib/auth.js';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  try {
    if (!(await consumeRateLimit(`register:${getClientIp(request)}`, 6, 60 * 60 * 1000))) return jsonError('Too many account attempts. Please try again later.', 429);
    const parsed = registrationSchema.safeParse(await readJsonLimited(request, 8_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the form fields.', 400, 'VALIDATION_ERROR');
    const { name, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.user.create({ data: { name, email, passwordHash, subscription: { create: { plan: 'FREE', status: 'FREE' } } }, select: { id: true, email: true, name: true, createdAt: true } });
    const cookie = await createSession(user.id);
    return Response.json({ user }, { status: 201, headers: { "Set-Cookie": cookie } });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return jsonError('An account with this email already exists.', 409);
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError(error.message === 'REQUEST_TOO_LARGE' ? 'Request is too large.' : 'Please submit valid form data.', 400);
    console.error('register_failed', error instanceof Error ? error.message : 'unknown');
    return jsonError('Account creation is temporarily unavailable. Please check the database configuration and try again.', 503);
  }
}
