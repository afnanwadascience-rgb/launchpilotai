import { z } from 'zod';
import { requireApiUser } from '../../lib/auth';
import { db } from '../../lib/db';
import { assertSameOrigin, jsonError, readJsonLimited } from '../../lib/http';

const schema = z.object({ title: z.string().trim().min(1).max(180).optional(), body: z.string().max(80_000).optional() }).refine((v) => Object.keys(v).length > 0);
export async function PATCH(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  try {
    const parsed = schema.safeParse(await readJsonLimited(request, 90_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the output fields.', 400);
    const existing = await db.generatedContent.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) return jsonError('Saved output not found.', 404);
    const content = await db.generatedContent.update({ where: { id }, data: parsed.data });
    return Response.json({ content });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Unable to update this output.', 503);
  }
}

export async function DELETE(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  const deleted = await db.generatedContent.deleteMany({ where: { id, userId: user.id } });
  return deleted.count ? Response.json({ ok: true }) : jsonError('Saved output not found.', 404);
}
