import { taskCreateSchema } from '../lib/validators.js';
import { getCurrentUser, requireApiUser } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { assertSameOrigin, jsonError, readJsonLimited } from '../lib/http.js';

export async function GET(request: Request) {
  const user = await getCurrentUser(request); if (!user) return jsonError('Please sign in to view launch tasks.', 401);
  const url = new URL(request.url); const status = url.searchParams.get('status');
  const tasks = await db.launchTask.findMany({ where: { userId: user.id, ...(status && ['todo', 'in-progress', 'done'].includes(status) ? { status } : {}) }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }], include: { project: { select: { id: true, title: true } } } });
  return Response.json({ tasks });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  try {
    const parsed = taskCreateSchema.safeParse(await readJsonLimited(request, 7_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the task fields.', 400);
    if (parsed.data.projectId) {
      const owned = await db.project.findFirst({ where: { id: parsed.data.projectId, userId: user.id }, select: { id: true } });
      if (!owned) return jsonError('Project not found in your account.', 404);
    }
    const task = await db.launchTask.create({ data: { userId: user.id, title: parsed.data.title, description: parsed.data.description || null, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null, priority: parsed.data.priority, status: parsed.data.status, projectId: parsed.data.projectId || null } });
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Unable to save this task.', 503);
  }
}
