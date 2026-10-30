import { describe, expect, it } from 'vitest';
import { canAccessTool, canCreateProject, canGenerate } from '@/lib/policy';
import { EXACT_WHOP_CHECKOUT_URL } from '@/lib/constants';
import { checkoutUrl, normalizeMembershipStatus, proIsActive } from '@/lib/billing';

describe('server-side access policy', () => {
  it('keeps advanced generation tools unavailable to Free accounts', () => {
    expect(canAccessTool('FREE', 'idea-validator')).toBe(true);
    expect(canAccessTool('FREE', 'product-blueprint')).toBe(true);
    expect(canAccessTool('FREE', 'sales-page-generator')).toBe(false);
    expect(canAccessTool('FREE', 'pricing-assistant')).toBe(false);
    expect(canAccessTool('FREE', 'marketing-kit')).toBe(false);
    expect(canAccessTool('PRO', 'marketing-kit')).toBe(true);
  });
  it('enforces generation limits independently of a browser session', () => {
    expect(canGenerate('FREE', 0)).toBe(true);
    expect(canGenerate('FREE', 2)).toBe(true);
    expect(canGenerate('FREE', 3)).toBe(false);
    expect(canGenerate('PRO', 99)).toBe(true);
    expect(canGenerate('PRO', 100)).toBe(false);
  });
  it('limits project creation by plan', () => {
    expect(canCreateProject('FREE', 2)).toBe(true);
    expect(canCreateProject('FREE', 3)).toBe(false);
    expect(canCreateProject('PRO', 99)).toBe(true);
    expect(canCreateProject('PRO', 100)).toBe(false);
  });
});

describe('Whop and subscription policy', () => {
  it('keeps Pro inactive for unverified, expired, or inactive states', () => {
    expect(proIsActive(null)).toBe(false);
    expect(proIsActive({ plan: 'FREE', status: 'FREE', currentPeriodEnd: null })).toBe(false);
    expect(proIsActive({ plan: 'PRO', status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() - 1000) })).toBe(false);
    expect(proIsActive({ plan: 'PRO', status: 'CANCELED', currentPeriodEnd: null })).toBe(false);
  });
  it('recognizes only eligible active membership states', () => {
    expect(normalizeMembershipStatus('active')).toEqual({ plan: 'PRO', status: 'ACTIVE' });
    expect(normalizeMembershipStatus('trialing')).toEqual({ plan: 'PRO', status: 'TRIALING' });
    expect(normalizeMembershipStatus('past_due')).toEqual({ plan: 'FREE', status: 'PAST_DUE' });
    expect(normalizeMembershipStatus('canceled')).toEqual({ plan: 'FREE', status: 'CANCELED' });
  });
  it('does not silently use a checkout URL from another product', () => {
    expect(checkoutUrl()).toBe(process.env.WHOP_PRO_CHECKOUT_URL?.trim() || '');
    expect(checkoutUrl()).toBe(EXACT_WHOP_CHECKOUT_URL);
    if (checkoutUrl()) {
      expect(new URL(checkoutUrl()).protocol).toBe('https:');
      expect(new URL(checkoutUrl()).hostname === 'whop.com' || new URL(checkoutUrl()).hostname.endsWith('.whop.com')).toBe(true);
    }
  });
});
