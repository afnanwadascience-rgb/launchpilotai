import { competitorSchema } from '../../lib/validators';
import { getCurrentUser, requireApiUser } from '../../lib/auth';
import { db } from '../../lib/db';
import { assertSameOrigin, jsonError, readJsonLimited } from '../../lib/http';

export async function GET(request: Request) {
  const user = await getCurrentUser(request); if (!user) return jsonError('Please sign in to view competitor notes.', 401);
  const competitors = await db.competitorRecord.findMany({ where: { userId: user.id }, orderBy: { researchedAt: 'desc' }, include: { project: { select: { id: true, title: true } } } });
  return Response.json({ competitors });
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  try {
    const parsed = competitorSchema.safeParse(await readJsonLimited(request, 12_000));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check the competitor fields.', 400);
    const data = parsed.data;
    if (data.url && !/^https?:\/\//i.test(data.url)) return jsonError('Use a website URL beginning with http:// or https://.', 400);
    if (data.projectId) {
      const project = await db.project.findFirst({ where: { id: data.projectId, userId: user.id }, select: { id: true } });
      if (!project) return jsonError('Project not found in your account.', 404);
    }
    const competitor = await db.competitorRecord.create({ data: { userId: user.id, projectId: data.projectId || null, name: data.name, url: data.url || null, observations: data.observations || null, pricingNotes: data.pricingNotes || null, researchedAt: data.researchedAt ? new Date(data.researchedAt) : new Date() } });
    return Response.json({ competitor }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Unable to save competitor notes.', 503);
  }
}
