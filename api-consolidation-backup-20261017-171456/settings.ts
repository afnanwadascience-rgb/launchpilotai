import { z } from 'zod';
import { requireApiUser } from '../lib/auth';
import { db } from '../lib/db';
import { assertSameOrigin, jsonError, readJsonLimited } from '../lib/http';

const schema = z.object({ name: z.string().trim().min(1).max(80) });
export async function PATCH(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  try {
    const parsed = schema.safeParse(await readJsonLimited(request, 3_000));
    if (!parsed.success) return jsonError('Name must be between 1 and 80 characters.', 400);
    const updated = await db.user.update({ where: { id: user.id }, data: { name: parsed.data.name }, select: { id: true, name: true, email: true } });
    return Response.json({ user: updated });
  } catch { return jsonError('Unable to update settings.', 503); }
}
