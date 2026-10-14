import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = vi.hoisted(() => ({ role: 'member' }));
const updateSettings = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/auth/server', async () => {
  const forbidden = () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  return {
    requireAuthApi: async () => ({ id: 1, email: 'a@example.com', name: 'A', role: user.role }),
    requireAdminApi: async () => {
      if (user.role !== 'admin') throw forbidden();
      return { id: 1, email: 'a@example.com', name: 'A', role: user.role };
    },
  };
});
vi.mock('@/lib/settings', () => ({ updateSettings }));
vi.mock('@/lib/config.server', () => ({ loadConfig: async () => ({ rag: { topK: 5 } }) }));

const { GET, PATCH } = await import('./route');

function patch(body: unknown) {
  return new Request('http://test/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Route helpers throw a Response for 401/403; Next returns it as the response. */
async function run(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
}

beforeEach(() => {
  updateSettings.mockClear();
});

describe('/api/settings', () => {
  it('lets any signed-in user read the settings', async () => {
    user.role = 'member';
    expect((await run(() => GET())).status).toBe(200);
  });

  it('refuses changes from a member: settings are global', async () => {
    user.role = 'member';
    const response = await run(() => PATCH(patch({ 'rag.topK': 9 })));
    expect(response.status).toBe(403);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('lets an admin change them', async () => {
    user.role = 'admin';
    const response = await run(() => PATCH(patch({ 'rag.topK': 9 })));
    expect(response.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledWith({ 'rag.topK': 9 });
  });
});
