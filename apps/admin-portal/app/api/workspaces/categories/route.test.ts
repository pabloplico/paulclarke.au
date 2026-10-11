import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/server', () => ({
  requireAuthApi: vi.fn(() =>
    Promise.resolve({ id: 1, email: 'test@test.com', name: 'Test', role: 'admin' })
  ),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

vi.mock('@/lib/db/schema', () => ({
  adminWorkspaces: {
    id: 'id',
    userId: 'userId',
    category: 'category',
  },
}));

let queryResult: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve(queryResult)),
    })),
  })),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = [];
});

describe('GET /api/workspaces/categories', () => {
  async function getHandler() {
    const mod = await import('./route');
    return mod.GET;
  }

  it('returns empty array when no categories exist', async () => {
    queryResult = [];
    const GET = await getHandler();
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it('returns distinct sorted categories', async () => {
    queryResult = [
      { category: 'Zeta' },
      { category: 'Alpha' },
      { category: 'Zeta' },
      { category: 'Beta' },
    ];
    const GET = await getHandler();
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual(['Alpha', 'Beta', 'Zeta']);
  });

  it('filters out null and empty categories', async () => {
    queryResult = [{ category: null }, { category: '' }, { category: '  ' }, { category: 'Valid' }];
    const GET = await getHandler();
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual(['Valid']);
  });
});
