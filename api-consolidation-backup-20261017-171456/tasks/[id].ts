import { taskUpdateSchema } from '../../lib/validators';
import { requireApiUser } from '../../lib/auth';
import { db } from '../../lib/db';
import { assertSameOrigin, jsonError, readJsonLimited } from '../../lib/http';

export async function PATCH(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  try {
    const parsed = taskUpdateSchema.safeParse(await readJsonLimited(request, 7_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the task fields.', 400);
    const existing = await db.launchTask.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) return jsonError('Task not found.', 404);
    if (parsed.data.projectId) {
      const project = await db.project.findFirst({ where: { id: parsed.data.projectId, userId: user.id }, select: { id: true } });
      if (!project) return jsonError('Project not found in your account.', 404);
    }
    const data = parsed.data;
    const task = await db.launchTask.update({ where: { id }, data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.projectId !== undefined ? { projectId: data.projectId } : {})
    } });
    return Response.json({ task });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Unable to update this task.', 503);
  }
}

export async function DELETE(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  const result = await db.launchTask.deleteMany({ where: { id, userId: user.id } });
  return result.count ? Response.json({ ok: true }) : jsonError('Task not found.', 404);
}
