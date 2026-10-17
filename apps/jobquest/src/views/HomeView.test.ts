import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { cleanup, render, screen } from '@testing-library/vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomeView from './HomeView.vue';

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(HomeView, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeView', () => {
  it('says the server and database are up when the health check passes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true }))
    );
    renderHome();

    await screen.findByText('Server and database are up.');
    expect(screen.getByRole('status').textContent).toBe('Server and database are up.');
  });

  it("says the server isn't responding when the health check fails", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: false }, { status: 503 }))
    );
    renderHome();

    await screen.findByText("The server isn't responding.");
    expect(screen.getByRole('status').textContent).toBe("The server isn't responding.");
  });
});
