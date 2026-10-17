import { screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { fakeJob, fakeSkill, installFakeApi } from './test/fakeApi';
import { renderApp } from './test/renderApp';

describe('the landing redirect', () => {
  it('sends a visitor with no skills to My Skills & Gaps', async () => {
    installFakeApi({ jobs: [fakeJob()], skills: [] });

    const { router } = await renderApp('/');

    expect(router.currentRoute.value.name).toBe('skills');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My Skills & Gaps' })
    ).toBeVisible();
  });

  it('sends a visitor with skills and jobs to Analytics', async () => {
    installFakeApi({ jobs: [fakeJob()], skills: [fakeSkill('Vue')] });

    const { router } = await renderApp('/');

    expect(router.currentRoute.value.name).toBe('analytics');
    expect(await screen.findByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  });

  it('sends a visitor with skills but no jobs to their job listings', async () => {
    installFakeApi({ jobs: [], skills: [fakeSkill('Vue')] });

    const { router } = await renderApp('/');

    expect(router.currentRoute.value.name).toBe('jobs');
  });

  it('stays on / and says so when the data fails to load, rather than looping', async () => {
    installFakeApi({ signedOut: true });

    const { router } = await renderApp('/');

    expect(router.currentRoute.value.name).toBe('home');
    expect(await screen.findByRole('heading', { name: 'Sign in to use JobQuest' })).toBeVisible();
  });

  it('leaves deep links alone', async () => {
    installFakeApi({ jobs: [], skills: [] });

    const { router } = await renderApp('/jobs?q=vue');

    expect(router.currentRoute.value.fullPath).toBe('/jobs?q=vue');
  });
});

describe('unknown pages', () => {
  it('show a not-found page with a way back', async () => {
    installFakeApi();

    await renderApp('/no/such/page');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to your job listings' })).toBeVisible();
  });
});
