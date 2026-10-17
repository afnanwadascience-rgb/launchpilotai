import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), requireApiUser: vi.fn(),
  projectFindFirst: vi.fn(), projectUpdate: vi.fn(), projectDeleteMany: vi.fn()
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser, requireApiUser: mocks.requireApiUser }));
vi.mock('@/lib/db', () => ({ db: { project: { findFirst: mocks.projectFindFirst, update: mocks.projectUpdate, deleteMany: mocks.projectDeleteMany, findMany: vi.fn(), count: vi.fn() } } }));
vi.mock('@/lib/usage', () => ({ getPlanContext: vi.fn() }));
import { GET as getProjects } from '@/api/projects';
import { PATCH as patchProject } from '@/api/projects/[id]';

beforeEach(() => { vi.clearAllMocks(); mocks.getCurrentUser.mockResolvedValue(null); mocks.projectFindFirst.mockResolvedValue(null); });

describe('private resource authorization', () => {
  it('rejects unauthenticated access to saved projects', async () => {
    const response = await getProjects(new Request('http://localhost/api/projects'));
    expect(response.status).toBe(401);
  });
  it('refuses to edit a project unless the signed-in user owns it', async () => {
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user_A', email: 'a@example.com', name: 'A' }, response: null });
    const request = new Request('http://localhost/api/projects/project_B', { method: 'PATCH', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify({ title: 'Changed title' }) });
    const response = await patchProject(request, { params: Promise.resolve({ id: 'project_B' }) });
    expect(response.status).toBe(404);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
    expect(mocks.projectFindFirst).toHaveBeenCalledWith({ where: { id: 'project_B', userId: 'user_A' }, select: { id: true } });
  });
});
