import { contactSchema } from '../lib/validators';
import { getCurrentUser } from '../lib/auth';
import { db } from '../lib/db';
import { assertSameOrigin, getClientIp, jsonError, readJsonLimited } from '../lib/http';
import { consumeRateLimit } from '../lib/rate-limit';

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  try {
    if (!(await consumeRateLimit(`contact:${getClientIp(request)}`, 5, 60 * 60 * 1000))) return jsonError('Too many messages were submitted. Please try again later.', 429);
    const parsed = contactSchema.safeParse(await readJsonLimited(request, 10_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the form fields.', 400);
    const user = await getCurrentUser(request);
    await db.contactMessage.create({ data: { ...parsed.data, email: parsed.data.email.toLowerCase(), userId: user?.id || null } });
    return Response.json({ ok: true, message: 'Your message was saved. Email delivery is not configured, so it has not been emailed.' }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Contact form storage is unavailable. Please try again later.', 503);
  }
}
