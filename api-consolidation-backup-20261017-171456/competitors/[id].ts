import { competitorSchema } from '../../lib/validators';
import { requireApiUser } from '../../lib/auth';
import { db } from '../../lib/db';
import { assertSameOrigin, jsonError, readJsonLimited } from '../../lib/http';

export async function PATCH(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  try {
    const parsed = competitorSchema.partial().safeParse(await readJsonLimited(request, 12_000));
    if (!parsed.success || !Object.keys(parsed.data || {}).length) return jsonError('Please check the competitor fields.', 400);
    const existing = await db.competitorRecord.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!existing) return jsonError('Competitor note not found.', 404);
    const data = parsed.data;
    if (data.url && !/^https?:\/\//i.test(data.url)) return jsonError('Use a website URL beginning with http:// or https://.', 400);
    if (data.projectId) {
      const project = await db.project.findFirst({ where: { id: data.projectId, userId: user.id }, select: { id: true } });
      if (!project) return jsonError('Project not found in your account.', 404);
    }
    const competitor = await db.competitorRecord.update({ where: { id }, data: {
      ...(data.name !== undefined ? { name: data.name } : {}), ...(data.url !== undefined ? { url: data.url || null } : {}),
      ...(data.observations !== undefined ? { observations: data.observations || null } : {}), ...(data.pricingNotes !== undefined ? { pricingNotes: data.pricingNotes || null } : {}),
      ...(data.researchedAt !== undefined ? { researchedAt: new Date(data.researchedAt) } : {}), ...(data.projectId !== undefined ? { projectId: data.projectId } : {})
    } });
    return Response.json({ competitor });
  } catch (error) {
    if (error instanceof Error && ['REQUEST_TOO_LARGE', 'INVALID_JSON'].includes(error.message)) return jsonError('Please submit valid form data.', 400);
    return jsonError('Unable to update competitor notes.', 503);
  }
}

export async function DELETE(request: Request, context?: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  const id = context ? (await context.params).id : (new URL(request.url).searchParams.get('__id') || new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
  const result = await db.competitorRecord.deleteMany({ where: { id, userId: user.id } });
  return result.count ? Response.json({ ok: true }) : jsonError('Competitor note not found.', 404);
}
