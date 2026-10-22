import { beforeEach, describe, expect, it, vi } from 'vitest';

const { unwrapWebhook } = vi.hoisted(() => ({
  unwrapWebhook: vi.fn(),
}));

vi.mock('@whop/sdk/helpers', () => ({
  unwrapWebhook,
}));

import { verifyWhopWebhook } from '@/lib/billing';

beforeEach(() => {
  unwrapWebhook.mockReset();
});

describe('Whop webhook signature validation', () => {
  it('rejects when no webhook secret is configured', () => {
    expect(
      verifyWhopWebhook(
        '{"type":"membership.updated"}',
        new Headers(),
        undefined,
      ),
    ).toBe(false);

    expect(unwrapWebhook).not.toHaveBeenCalled();
  });

  it('delegates raw-body signature validation to the Whop SDK helper', () => {
    unwrapWebhook.mockReturnValue({
      id: 'evt_123',
      type: 'membership.updated',
    });

    const body =
      '{"type":"membership.updated","data":{"id":"mem_12345"}}';

    const headers = new Headers({
      'webhook-id': 'evt_123',
      'content-type': 'application/json',
    });

    expect(
      verifyWhopWebhook(body, headers, 'ws_test_secret'),
    ).toBe(true);

    expect(unwrapWebhook).toHaveBeenCalledWith(body, {
      headers: Object.fromEntries(headers.entries()),
      key: 'ws_test_secret',
    });
  });

  it('rejects invalid signatures when the SDK verifier throws', () => {
    unwrapWebhook.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    expect(
      verifyWhopWebhook(
        '{"type":"membership.updated"}',
        new Headers({ 'webhook-id': 'evt_123' }),
        'ws_test_secret',
      ),
    ).toBe(false);
  });
});
