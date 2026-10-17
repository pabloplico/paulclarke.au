import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/vue';
import { createWebHistory } from 'vue-router';
import App from '../App.vue';
import { createAppRouter } from '../router';

/**
 * Renders the whole app (layout, router, guard, Vue Query) at `path`, against
 * whatever installFakeApi() set up. Resolves once the first navigation, guard
 * redirects included, has finished.
 */
export async function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The browser's history, as in production (jsdom implements it): Back to the job
  // list relies on history.state, which the memory history doesn't keep
  const router = createAppRouter(queryClient, createWebHistory());
  await router.push(path);
  await router.isReady();
  const user = userEvent.setup();
  const view = render(App, { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] } });
  return { ...view, router, user };
}
