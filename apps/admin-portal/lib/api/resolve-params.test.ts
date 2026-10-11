import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockWhereResult = vi.hoisted(() => vi.fn());
const mockDb = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: mockWhereResult,
    })),
  })),
}));

// ── vi.mock calls ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(),
}));

vi.mock('@/lib/workspaces/resolve', () => ({
  resolveWorkspace: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaceSections: { id: 'id', workspaceId: 'workspaceId' },
  adminWorkspaces: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { requireAuthApi } from '@/lib/auth/server';
import { resolveWorkspace } from '@/lib/workspaces/resolve';
import { resolveWorkspaceParams, resolveWorkspaceSectionParams } from './resolve-params';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockRequireAuthApi = vi.mocked(requireAuthApi);
const mockResolveWorkspace = vi.mocked(resolveWorkspace);

const defaultUser = { id: 1, email: 'user@example.com', name: 'Test User', role: 'admin' as const };
const defaultWorkspace = { id: 10, slug: 'my-ws', userId: 1, title: 'My WS' } as Awaited<
  ReturnType<typeof resolveWorkspace>
>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveWorkspaceParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore select chain each time
    mockDb.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: mockWhereResult,
      })),
    }));
  });

  describe('TC-020-A1 — returns { workspace, user } when workspace exists', () => {
    it('resolves with correct workspace and user objects', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any);

      const result = await resolveWorkspaceParams(Promise.resolve({ id: 'my-ws' }));

      expect(result.error).toBeUndefined();
      expect(result.workspace?.id).toBe(10);
      expect(result.user?.id).toBe(1);
    });
  });

  describe('TC-020-A2 — passes the string id directly to resolveWorkspace', () => {
    it('calls resolveWorkspace with the exact string id and user.id', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any);

      await resolveWorkspaceParams(Promise.resolve({ id: 'test-slug' }));

      expect(mockResolveWorkspace).toHaveBeenCalledWith('test-slug', 1);
    });
  });

  describe('TC-020-E1 — returns { error } with 404 status when workspace not found', () => {
    it('returns a NextResponse with status 404 and workspace-not-found body', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(null);

      const result = await resolveWorkspaceParams(Promise.resolve({ id: 'missing' }));

      expect(result.workspace).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(404);

      const body = await result.error!.json();
      expect(body).toEqual({ error: 'Workspace not found' });
    });
  });

  describe('TC-020-E2 — propagates auth errors from requireAuthApi', () => {
    it('rejects with the same error when requireAuthApi throws', async () => {
      mockRequireAuthApi.mockRejectedValue(new Error('Unauthenticated'));

      await expect(resolveWorkspaceParams(Promise.resolve({ id: 'any' }))).rejects.toThrow(
        'Unauthenticated'
      );
    });
  });
});

describe('resolveWorkspaceSectionParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: mockWhereResult,
      })),
    }));
  });

  describe('TC-020-B1 — returns { workspace, section, user } when both exist and ownership matches', () => {
    it('resolves with section, workspace, and user', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any);
      mockWhereResult.mockResolvedValue([{ id: 55, workspaceId: 10, title: 'Intro' }]);

      const result = await resolveWorkspaceSectionParams(
        Promise.resolve({ id: 'ws-slug', sectionId: '55' })
      );

      expect(result.error).toBeUndefined();
      expect(result.section?.id).toBe(55);
      expect(result.workspace?.id).toBe(10);
      expect(result.user?.id).toBe(1);
    });
  });

  describe('TC-020-B2 — sectionId string is coerced to number for the query', () => {
    it('passes Number(sectionId) to the eq call', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any);
      mockWhereResult.mockResolvedValue([{ id: 55, workspaceId: 10 }]);

      await resolveWorkspaceSectionParams(Promise.resolve({ id: 'ws-slug', sectionId: '55' }));

      // mockWhereResult receives the eq() result: { col, val }
      const whereArg = mockWhereResult.mock.calls[0]![0];
      expect(whereArg.val).toBe(55);
      expect(typeof whereArg.val).toBe('number');
    });
  });

  describe('TC-020-E3 — returns 404 when section query returns empty array', () => {
    it('returns error with status 404 and section-not-found body', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any);
      mockWhereResult.mockResolvedValue([]);

      const result = await resolveWorkspaceSectionParams(
        Promise.resolve({ id: 'ws-slug', sectionId: '99' })
      );

      expect(result.section).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(404);

      const body = await result.error!.json();
      expect(body).toEqual({ error: 'Section not found' });
    });
  });

  describe('TC-020-E4 — returns 404 when section belongs to a different workspace', () => {
    it('returns 404 error when section.workspaceId does not match workspace.id', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any); // workspace.id = 10
      mockWhereResult.mockResolvedValue([{ id: 55, workspaceId: 99 }]); // mismatch

      const result = await resolveWorkspaceSectionParams(
        Promise.resolve({ id: 'ws-slug', sectionId: '55' })
      );

      expect(result.section).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(404);
    });
  });

  describe('TC-020-E5 — forwards workspace 404 without querying sections', () => {
    it('returns workspace error immediately and does not call db.select', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(null);

      const result = await resolveWorkspaceSectionParams(
        Promise.resolve({ id: 'missing', sectionId: '1' })
      );

      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(404);
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('TC-020-B3 — params is a Promise that must be awaited', () => {
    it('resolves correctly when params resolves asynchronously', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any);
      mockWhereResult.mockResolvedValue([{ id: 1, workspaceId: 10 }]);

      const delayedParams = new Promise<{ id: string; sectionId: string }>((resolve) =>
        setTimeout(() => resolve({ id: 'ws', sectionId: '1' }), 0)
      );

      const result = await resolveWorkspaceSectionParams(delayedParams);

      expect(result.error).toBeUndefined();
      expect(result.section?.id).toBe(1);
    });
  });

  describe('TC-020-B4 — non-numeric sectionId coerces to NaN and returns 404', () => {
    it('does not throw and returns 404 when sectionId is "abc"', async () => {
      mockRequireAuthApi.mockResolvedValue(defaultUser as any);
      mockResolveWorkspace.mockResolvedValue(defaultWorkspace as any);
      mockWhereResult.mockResolvedValue([]); // NaN id matches nothing

      const result = await resolveWorkspaceSectionParams(
        Promise.resolve({ id: 'ws-slug', sectionId: 'abc' })
      );

      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(404);
    });
  });
});
