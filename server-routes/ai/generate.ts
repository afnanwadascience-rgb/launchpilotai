import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { aiRequestSchema } from '../../lib/validators';
import { isAiTool, TOOL_DETAILS } from '../../lib/constants';
import { generateWithGroq } from '../../lib/ai';
import { failGeneration, getPlanContext, reserveGeneration } from '../../lib/usage';
import { requireApiUser } from '../../lib/auth';
import { assertSameOrigin, jsonError, readJsonLimited } from '../../lib/http';
import { consumeRateLimit } from '../../lib/rate-limit';
import { db } from '../../lib/db';
import { canAccessTool } from '../../lib/policy';

export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  try {
    if (!(await consumeRateLimit(`ai:${user.id}`, 12, 60 * 60 * 1000))) return jsonError('You have made too many AI requests. Please try again later.', 429, 'RATE_LIMITED');
    const raw = await readJsonLimited(request, 18_000);
    const parsed = aiRequestSchema.safeParse(raw);
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || 'Please check your inputs.', 400, 'VALIDATION_ERROR');
    const { tool, input } = parsed.data;
    if (!isAiTool(tool)) return jsonError('Unknown tool.', 400);
    const planContext = await getPlanContext(user.id);
    if (!canAccessTool(planContext.plan, tool)) return jsonError('This feature is available on Pro. Verify your membership or upgrade to continue.', 403, 'PRO_REQUIRED');

    const projectId = 'projectId' in parsed.data ? (parsed.data.projectId as string | null | undefined) : undefined;
    if (projectId) {
      const owned = await db.project.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true } });
      if (!owned) return jsonError('That project was not found in your account.', 404);
    }
    const headerKey = request.headers.get('idempotency-key');
    const requestKey = (headerKey && /^[a-zA-Z0-9._:-]{8,120}$/.test(headerKey)) ? headerKey : randomUUID();
    const reservation = await reserveGeneration(user.id, requestKey, tool);
    if (reservation.mode === 'limit') return Response.json({ error: `You've used your ${reservation.limit} ${reservation.plan === 'PRO' ? 'Pro' : 'Free'} AI generations.`, code: 'QUOTA_EXCEEDED' }, { status: 402 });
    if (reservation.mode === 'pending') return jsonError('This generation is already running. Wait a moment before retrying.', 409, 'REQUEST_PENDING');
    if (reservation.mode === 'cached') {
      const cached = reservation.response as { result?: string; contentId?: string } | null;
      const quota = await getPlanContext(user.id);
      return Response.json({ ok: true, result: cached?.result || '', contentId: cached?.contentId, quota, cached: true });
    }

    try {
      const result = await generateWithGroq(tool, input as unknown as Record<string, unknown>);
      const title = `${TOOL_DETAILS[tool].title} · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      const content = await db.$transaction(async (tx) => {
        const saved = await tx.generatedContent.create({ data: { userId: user.id, projectId: projectId || null, type: tool, title, body: result, metadata: input as Prisma.InputJsonValue } });
        const responsePayload = { result, contentId: saved.id };
        await tx.usageRecord.update({ where: { userId_requestKey: { userId: user.id, requestKey } }, data: { status: 'COMPLETE', response: responsePayload, completedAt: new Date() } });
        return saved;
      }, { isolationLevel: 'Serializable' });
      const quota = await getPlanContext(user.id);
      return Response.json({ ok: true, result, contentId: content.id, quota, cached: false });
    } catch (error) {
      await failGeneration(user.id, requestKey).catch(() => undefined);
      if (error instanceof Error && error.message === 'GROQ_NOT_CONFIGURED') return jsonError('AI generation is not configured yet. Add GROQ_API_KEY to the server environment.', 503, 'AI_NOT_CONFIGURED');
      if (error instanceof Error && error.message === 'EMPTY_AI_RESPONSE') return jsonError('The AI service returned an empty response. Please try again.', 502);
      console.error('ai_generation_failed', error instanceof Error ? error.message : 'unknown');
      return jsonError('AI generation failed. Your quota was not consumed; please try again.', 502, 'AI_FAILED');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') return jsonError('Request is too large.', 413);
    if (error instanceof Error && error.message === 'INVALID_JSON') return jsonError('Please submit valid form data.', 400);
    if (error instanceof Error && error.message.includes('P2034')) return jsonError('Another generation is being processed. Try again shortly.', 409);
    console.error('ai_request_failed', error instanceof Error ? error.message : 'unknown');
    return jsonError('Unable to process the request right now.', 503);
  }
}
