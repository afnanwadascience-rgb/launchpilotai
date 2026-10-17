import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ unwrapWebhook: vi.fn() }));
vi.mock('@whop/sdk/helpers', () => ({ unwrapWebhook: sdk.unwrapWebhook }));

import { verifyWhopWebhook } from '@/lib/billing';

beforeEach(() => sdk.unwrapWebhook.mockReset());

describe('Whop webhook signature validation', () => {
  it('rejects when no webhook secret is configured', () => {
    expect(verifyWhopWebhook('{"type":"membership.updated"}', new Headers(), undefined)).toBe(false);
    expect(sdk.unwrapWebhook).not.toHaveBeenCalled();
  });

  it('delegates raw-body signature validation to Whop official SDK helper', () => {
    sdk.unwrapWebhook.mockReturnValue({ id: 'evt_123', type: 'membership.updated' });
    const body = '{"type":"membership.updated","data":{"id":"mem_12345"}}';
    const headers = new Headers({ 'webhook-id': 'evt_123', 'content-type': 'application/json' });
    expect(verifyWhopWebhook(body, headers, 'ws_test_secret')).toBe(true);
    expect(sdk.unwrapWebhook).toHaveBeenCalledWith(body, {
      headers: Object.fromEntries(headers.entries()),
      key: 'ws_test_secret'
    });
  });

  it('rejects altered or invalid signatures when the SDK verifier throws', () => {
    sdk.unwrapWebhook.mockImplementation(() => { throw new Error('invalid signature'); });
    expect(verifyWhopWebhook('{"type":"membership.updated"}', new Headers({ 'webhook-id': 'evt_123' }), 'ws_test_secret')).toBe(false);
  });
});
