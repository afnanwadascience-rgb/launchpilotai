import { describe, expect, it } from 'vitest';
import gateway from '../api/gateway';

describe('Vercel API gateway', () => {
  it('serves health without loading any route modules', async () => {
    const response = await gateway.fetch(
      new Request('https://example.test/api/gateway?__route=health')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      service: 'launchpilot-ai-api',
      status: 'ready',
    });
  });

  it('returns JSON for unknown API paths', async () => {
    const response = await gateway.fetch(
      new Request('https://example.test/api/gateway?__route=no-such-route')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: 'API endpoint not found.',
    });
  });
});