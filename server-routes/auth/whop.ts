import { startWhopOAuth } from '../../lib/whop-oauth';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  return startWhopOAuth(request);
}
