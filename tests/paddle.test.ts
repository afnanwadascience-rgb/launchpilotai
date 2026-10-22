import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPaddleWebhook } from '@/lib/paddle';

function sign(body: string, secret: string, timestamp: number) {
  const digest = createHmac('sha256', secret).update(`${timestamp}:${body}`, 'utf8').digest('hex');
  return `ts=${timestamp};h1=${digest}`;
}

describe('Paddle webhook signature verification', () => {
  const secret = 'pdl_ntfset_test_secret';
  const body = '{"event_id":"evt_test","event_type":"subscription.updated","data":{"id":"sub_test"}}';
  const now = 1_800_000_000;

  it('accepts a valid raw-body signature', () => {
    expect(verifyPaddleWebhook(body, sign(body, secret, now), secret, now)).toBe(true);
  });

  it('rejects a changed body', () => {
    expect(verifyPaddleWebhook(`${body} `, sign(body, secret, now), secret, now)).toBe(false);
  });

  it('rejects an old signature timestamp', () => {
    expect(verifyPaddleWebhook(body, sign(body, secret, now - 301), secret, now)).toBe(false);
  });

  it('rejects missing secrets and malformed headers', () => {
    expect(verifyPaddleWebhook(body, sign(body, secret, now), undefined, now)).toBe(false);
    expect(verifyPaddleWebhook(body, 'invalid', secret, now)).toBe(false);
  });
});
