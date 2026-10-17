import { deleteSession } from '../../lib/auth';
import { assertSameOrigin, jsonError } from '../../lib/http';
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  try { const cookie = await deleteSession(request); return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } }); }
  catch { return jsonError('Unable to end the session. Please refresh and try again.', 503); }
}
