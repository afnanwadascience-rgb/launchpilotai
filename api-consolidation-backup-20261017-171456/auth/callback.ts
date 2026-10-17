import { finishWhopOAuth } from '../../lib/whop-oauth';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  return finishWhopOAuth(request);
}
