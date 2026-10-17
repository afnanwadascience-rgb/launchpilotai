import { getCurrentUser } from '../../lib/auth';
import { getPlanContext } from '../../lib/usage';
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ user: null }, { status: 401 });
  const usage = await getPlanContext(user.id);
  return Response.json({ user, usage });
}
