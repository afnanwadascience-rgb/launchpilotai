
export function jsonError(message: string, status = 400, code?: string) {
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser clients are still authenticated and rate limited.
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    return originUrl.origin === requestUrl.origin;
  } catch {
    return false;
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = request.headers.get('x-real-ip')?.trim();
  // Used only as a rate-limit key; do not log or display it.
  return (forwarded || real || 'unknown').slice(0, 100);
}

export async function readJsonLimited(request: Request, maxBytes = 20_000): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  try { return JSON.parse(text); } catch { throw new Error('INVALID_JSON'); }
}
