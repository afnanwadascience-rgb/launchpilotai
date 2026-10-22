import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(), getPlanContext: vi.fn(), reserveGeneration: vi.fn(), failGeneration: vi.fn(),
  consumeRateLimit: vi.fn(), generateWithGroq: vi.fn(), projectFindFirst: vi.fn()
}));
vi.mock('@/lib/auth', () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock('@/lib/usage', () => ({ getPlanContext: mocks.getPlanContext, reserveGeneration: mocks.reserveGeneration, failGeneration: mocks.failGeneration }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock('@/lib/ai', () => ({ generateWithGroq: mocks.generateWithGroq }));
vi.mock('@/lib/db', () => ({ db: { project: { findFirst: mocks.projectFindFirst }, $transaction: vi.fn() } }));
import { POST } from '@/server-routes/ai/generate';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiUser.mockResolvedValue({ user: { id: 'user_free', email: 'free@example.com', name: 'Free' }, response: null });
  mocks.consumeRateLimit.mockResolvedValue(true);
  mocks.getPlanContext.mockResolvedValue({ plan: 'FREE', status: 'FREE', used: 0, limit: 3, remaining: 3, resetsAt: null });
});

describe('AI generation endpoint authorization and validation', () => {
  it('blocks a Free user from the Pro sales-page tool server-side', async () => {
    const request = new Request('http://localhost/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify({ tool: 'sales-page-generator', input: { product: 'A template', audience: 'Freelancers', benefits: 'Save time', tone: 'Clear' } }) });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(mocks.reserveGeneration).not.toHaveBeenCalled();
    expect(mocks.generateWithGroq).not.toHaveBeenCalled();
  });
  it('validates the submitted tool input before consuming usage', async () => {
    const request = new Request('http://localhost/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify({ tool: 'idea-validator', input: { idea: '', audience: 'Creators' } }) });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mocks.reserveGeneration).not.toHaveBeenCalled();
  });
  it('rejects a cross-origin mutation', async () => {
    const request = new Request('http://localhost/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ tool: 'idea-validator', input: {} }) });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
