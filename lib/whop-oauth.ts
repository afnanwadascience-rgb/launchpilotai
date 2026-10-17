import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { createSession } from './auth';

const OAUTH_COOKIE = 'lp_whop_oauth';
const OAUTH_COOKIE_TTL_SECONDS = 10 * 60;
const DEV_SESSION_SECRET = 'development-only-session-pepper-change-before-deploy';

type OAuthState = {
  codeVerifier: string;
  state: string;
  nonce: string;
  createdAt: number;
};

type WhopTokenResponse = {
  access_token?: unknown;
  id_token?: unknown;
  token_type?: unknown;
};

type WhopUserInfo = {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  preferred_username?: unknown;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32)) {
    throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  }
  return value || DEV_SESSION_SECRET;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function cookieValue(state: OAuthState): string {
  const payload = base64url(JSON.stringify(state));
  return `${payload}.${sign(payload)}`;
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}

function readOAuthCookie(request: Request): OAuthState | null {
  try {
    const raw = getCookie(request, OAUTH_COOKIE);
    if (!raw) return null;
    const separator = raw.lastIndexOf('.');
    if (separator <= 0) return null;
    const payload = raw.slice(0, separator);
    const signature = raw.slice(separator + 1);
    const expected = sign(payload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<OAuthState>;
    if (typeof data.createdAt !== 'number' || Date.now() - data.createdAt > OAUTH_COOKIE_TTL_SECONDS * 1000 || Date.now() < data.createdAt) return null;
    if (typeof data.codeVerifier !== 'string' || typeof data.state !== 'string' || typeof data.nonce !== 'string') return null;
    return data as OAuthState;
  } catch {
    return null;
  }
}

function setCookie(value: string, maxAge: number): string {
  const pieces = [`${OAUTH_COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') pieces.push('Secure');
  return pieces.join('; ');
}

function clearCookie(): string {
  const pieces = [`${OAUTH_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') pieces.push('Secure');
  return pieces.join('; ');
}

function appBaseUrl(request: Request): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') throw new Error('APP_BASE_URL_NOT_CONFIGURED');
    return new URL(request.url).origin;
  }
  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('APP_BASE_URL_INVALID');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw new Error('APP_BASE_URL_INVALID');
  return parsed.origin;
}

function requestFallbackOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function redirectToLogin(request: Request, error: string): Response {
  let base = requestFallbackOrigin(request);
  try { base = appBaseUrl(request); } catch { /* use the request origin to display a safe setup error */ }
  const target = new URL('/', base);
  target.searchParams.set('authError', error);
  target.hash = '/login';
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store', 'Set-Cookie': clearCookie() } });
}

function callbackUrl(base: string): string {
  return new URL('/api/auth/callback', `${base}/`).toString();
}

function whopApiBase(): string {
  return process.env.WHOP_SANDBOX?.trim().toLowerCase() === 'true'
    ? 'https://sandbox-api.whop.com'
    : 'https://api.whop.com';
}

function configuration(request: Request) {
  const base = appBaseUrl(request);
  const clientId = process.env.WHOP_CLIENT_ID?.trim();
  const clientSecret = process.env.WHOP_CLIENT_SECRET?.trim();
  if (!clientId || !clientId.startsWith('app_') || !clientSecret) throw new Error('WHOP_OAUTH_NOT_CONFIGURED');
  // Validate the signing secret now, before sending the user away to Whop.
  secret();
  return { base, clientId, clientSecret, redirectUri: callbackUrl(base) };
}

function randomString(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const pieces = idToken.split('.');
  if (pieces.length !== 3 || !pieces[1]) throw new Error('INVALID_ID_TOKEN');
  const payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8')) as unknown;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_ID_TOKEN');
  return payload as Record<string, unknown>;
}

async function postJson(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error('WHOP_OAUTH_REQUEST_FAILED');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('WHOP_OAUTH_BAD_RESPONSE');
  return payload as Record<string, unknown>;
}

async function getWhopUser(accessToken: string): Promise<WhopUserInfo> {
  const response = await fetch(`${whopApiBase()}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error('WHOP_USERINFO_FAILED');
  const profile: unknown = await response.json();
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('WHOP_USERINFO_BAD_RESPONSE');
  const user = profile as WhopUserInfo;
  if (typeof user.sub !== 'string' || !/^user_[a-zA-Z0-9_-]{3,180}$/.test(user.sub)) throw new Error('WHOP_USERINFO_INVALID_ID');
  if (typeof user.email !== 'string' || user.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error('WHOP_USERINFO_EMAIL_REQUIRED');
  if (user.email_verified === false) throw new Error('WHOP_EMAIL_NOT_VERIFIED');
  return user;
}

async function findOrCreateWhopUser(profile: WhopUserInfo) {
  const whopUserId = profile.sub as string;
  const email = (profile.email as string).trim().toLowerCase();
  const name = (typeof profile.name === 'string' && profile.name.trim())
    || (typeof profile.preferred_username === 'string' && profile.preferred_username.trim())
    || email.split('@')[0]
    || 'Whop user';

  const byWhopId = await db.user.findUnique({ where: { whopUserId }, select: { id: true, email: true, name: true, whopUserId: true } });
  if (byWhopId) {
    if (byWhopId.email !== email) {
      const emailOwner = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (emailOwner && emailOwner.id !== byWhopId.id) throw new Error('WHOP_EMAIL_ALREADY_IN_USE');
    }
    const updated = await db.user.update({ where: { id: byWhopId.id }, data: { email, name }, select: { id: true, email: true, name: true, createdAt: true } });
    await db.subscription.upsert({ where: { userId: updated.id }, create: { userId: updated.id, plan: 'FREE', status: 'FREE' }, update: {} });
    return updated;
  }

  const byEmail = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, whopUserId: true, createdAt: true } });
  if (byEmail) {
    if (byEmail.whopUserId && byEmail.whopUserId !== whopUserId) throw new Error('WHOP_ACCOUNT_ALREADY_LINKED');
    if (profile.email_verified !== true) throw new Error('WHOP_EMAIL_VERIFICATION_REQUIRED_FOR_LINK');
    const updated = await db.user.update({ where: { id: byEmail.id }, data: { whopUserId, name }, select: { id: true, email: true, name: true, createdAt: true } });
    await db.subscription.upsert({ where: { userId: updated.id }, create: { userId: updated.id, plan: 'FREE', status: 'FREE' }, update: {} });
    return updated;
  }

  try {
    return await db.user.create({
      data: { email, name, passwordHash: null, whopUserId, subscription: { create: { plan: 'FREE', status: 'FREE' } } },
      select: { id: true, email: true, name: true, createdAt: true }
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const retry = await db.user.findUnique({ where: { whopUserId }, select: { id: true, email: true, name: true, createdAt: true } });
      if (retry) return retry;
      throw new Error('WHOP_ACCOUNT_LINK_CONFLICT');
    }
    throw error;
  }
}

export async function startWhopOAuth(request: Request): Promise<Response> {
  let cfg: ReturnType<typeof configuration>;
  try {
    cfg = configuration(request);
  } catch (error) {
    const reason = error instanceof Error && error.message === 'APP_BASE_URL_NOT_CONFIGURED' ? 'app_url_not_configured'
      : error instanceof Error && error.message === 'APP_BASE_URL_INVALID' ? 'app_url_invalid'
      : error instanceof Error && error.message === 'SESSION_SECRET_NOT_CONFIGURED' ? 'session_secret_not_configured'
      : 'whop_not_configured';
    return redirectToLogin(request, reason);
  }

  const oauthState: OAuthState = {
    codeVerifier: randomString(48),
    state: randomString(24),
    nonce: randomString(24),
    createdAt: Date.now()
  };
  const challenge = createHash('sha256').update(oauthState.codeVerifier).digest('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: 'openid profile email',
    state: oauthState.state,
    nonce: oauthState.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  const location = `${whopApiBase()}/oauth/authorize?${params.toString()}`;
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': setCookie(cookieValue(oauthState), OAUTH_COOKIE_TTL_SECONDS) } });
}

export async function finishWhopOAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const providerError = url.searchParams.get('error');
  if (providerError) return redirectToLogin(request, 'whop_signin_cancelled');

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code || code.length > 4096 || !returnedState) return redirectToLogin(request, 'whop_missing_callback_parameters');

  const oauthState = readOAuthCookie(request);
  if (!oauthState || oauthState.state !== returnedState) return redirectToLogin(request, 'whop_state_mismatch');

  let cfg: ReturnType<typeof configuration>;
  try { cfg = configuration(request); }
  catch { return redirectToLogin(request, 'whop_not_configured'); }

  try {
    const tokens = await postJson(`${whopApiBase()}/oauth/token`, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: oauthState.codeVerifier
    }) as WhopTokenResponse;
    if (typeof tokens.access_token !== 'string' || typeof tokens.id_token !== 'string') throw new Error('WHOP_TOKENS_MISSING');
    const idPayload = decodeJwtPayload(tokens.id_token);
    if (typeof idPayload.nonce !== 'string' || idPayload.nonce !== oauthState.nonce) throw new Error('WHOP_NONCE_MISMATCH');

    const profile = await getWhopUser(tokens.access_token);
    const user = await findOrCreateWhopUser(profile);
    const sessionCookie = await createSession(user.id);
    const destination = new URL('/', cfg.base);
    destination.hash = '/dashboard';
    const headers = new Headers({ Location: destination.toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', sessionCookie);
    headers.append('Set-Cookie', clearCookie());
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    const userError = reason === 'WHOP_ACCOUNT_ALREADY_LINKED' || reason === 'WHOP_ACCOUNT_LINK_CONFLICT' || reason === 'WHOP_EMAIL_ALREADY_IN_USE' || reason === 'WHOP_EMAIL_VERIFICATION_REQUIRED_FOR_LINK'
      ? 'whop_account_link_conflict'
      : reason === 'WHOP_EMAIL_NOT_VERIFIED' ? 'whop_email_not_verified'
      : 'whop_signin_failed';
    console.error('whop_oauth_failed', reason || 'unknown');
    return redirectToLogin(request, userError);
  }
}
