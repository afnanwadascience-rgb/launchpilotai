import { projectUpdateSchema } from '../../lib/validators';
import { requireApiUser } from '../../lib/auth';
import { db } from '../../lib/db';
import { assertSameOrigin, jsonError, readJsonLimited } from '../../lib/http';

export async function PATCH(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  try {
    const parsed = projectUpdateSchema.safeParse(await readJsonLimited(request, 5_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the project fields.', 400);
    const owned = await db.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!owned) return jsonError('Project not found.', 404);
    const project = await db.project.update({ where: { id }, data: { ...(parsed.data.title ? { title: parsed.data.title } : {}), ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}) } });
    return Response.json({ project });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Unable to update this project.', 503);
  }
}

export async function DELETE(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  const deleted = await db.project.deleteMany({ where: { id, userId: user.id } });
  if (!deleted.count) return jsonError('Project not found.', 404);
  return Response.json({ ok: true });
}
