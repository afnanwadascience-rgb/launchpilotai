import { projectCreateSchema } from '../lib/validators.js';
import { requireApiUser, getCurrentUser } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { getPlanContext } from '../lib/usage.js';
import { canCreateProject } from '../lib/policy.js';
import { assertSameOrigin, jsonError, readJsonLimited } from '../lib/http.js';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return jsonError('Please sign in to view projects.', 401);
  const [projects, outputs] = await Promise.all([
    db.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { generatedContent: true, tasks: true } } } }),
    db.generatedContent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, type: true, body: true, projectId: true, createdAt: true } })
  ]);
  return Response.json({ projects, outputs });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  try {
    const parsed = projectCreateSchema.safeParse(await readJsonLimited(request, 5_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the project fields.', 400);
    const usage = await getPlanContext(user.id);
    const count = await db.project.count({ where: { userId: user.id } });
    const limit = usage.plan === 'PRO' ? 100 : 3;
    if (!canCreateProject(usage.plan, count)) return Response.json({ error: `Your ${usage.plan === 'PRO' ? 'Pro' : 'Free'} plan allows ${limit} saved projects.`, code: 'PROJECT_LIMIT' }, { status: 402 });
    const project = await db.project.create({ data: { userId: user.id, title: parsed.data.title, description: parsed.data.description || null } });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Unable to save the project right now.', 503);
  }
}
