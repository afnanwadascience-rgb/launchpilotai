import { z } from 'zod';
import { requireApiUser } from '../../lib/auth.js';
import { fetchWhopMembership, membershipMatchesConfiguredProduct, syncMembershipForEmail } from '../../lib/billing.js';
import { getPlanContext } from '../../lib/usage.js';
import { assertSameOrigin, jsonError, readJsonLimited } from '../../lib/http.js';
import { consumeRateLimit } from '../../lib/rate-limit.js';

const schema = z.object({ membershipId: z.string().trim().min(8).max(160) });
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return jsonError('Request origin could not be validated.', 403);
  const { user, response } = await requireApiUser(request); if (!user) return response;
  if (!(await consumeRateLimit(`billing-refresh:${user.id}`, 8, 60 * 60 * 1000))) return jsonError('Too many verification attempts. Please try again later.', 429);
  try {
    const parsed = schema.safeParse(await readJsonLimited(request, 3_000));
    if (!parsed.success) return jsonError('Enter a valid Whop membership ID.', 400);
    const membership = await fetchWhopMembership(parsed.data.membershipId);
    if (membership.user?.email?.toLowerCase() !== user.email.toLowerCase()) return jsonError('That membership does not match your signed-in account email.', 403);
    if (!membershipMatchesConfiguredProduct(membership)) return jsonError('This membership does not match the configured LaunchPilot Pro product and plan.', 403);
    const synced = await syncMembershipForEmail(membership);
    if (!synced) return jsonError('Membership was verified but could not be linked to this account. Confirm that the Whop account email matches your LaunchPilot account.', 403);
    const usage = await getPlanContext(user.id);
    return Response.json({ ok: true, usage, message: `Membership checked with Whop. Current plan: ${usage.plan}.` });
  } catch (error) {
    if (error instanceof Error && error.message === 'WHOP_NOT_CONFIGURED') return jsonError('Whop verification is not configured yet. Add the server-side Whop API key and product/plan IDs.', 503, 'WHOP_NOT_CONFIGURED');
    if (error instanceof Error && error.message === 'MEMBERSHIP_NOT_FOUND') return jsonError('Whop did not find that membership ID.', 404);
    if (error instanceof Error && error.message === 'INVALID_MEMBERSHIP_ID') return jsonError('That membership ID format is not valid.', 400);
    return jsonError('Could not verify membership with Whop right now. No access status was changed.', 502);
  }
}
