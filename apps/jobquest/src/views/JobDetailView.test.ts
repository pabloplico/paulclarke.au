import { screen, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { fakeJob, fakeSkill, installFakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

const job = fakeJob({
  title: 'Vue Developer',
  company: 'Saltwater Digital',
  skills: ['Vue', 'TypeScript'],
  software: ['Git', 'Figma'],
  requirements: ['3+ years'],
  rawText: 'We build booking platforms.',
});

describe('Job detail', () => {
  it('shows the match, and which skills the visitor has and lacks', async () => {
    installFakeApi({ jobs: [job], skills: [fakeSkill('Vue'), fakeSkill('git')] });

    await renderApp(`/jobs/${job.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Vue Developer' })).toBeVisible();
    expect(screen.getByText('50%')).toBeVisible();
    expect(screen.getByText('2 of 4 skills')).toBeVisible();
    const toDevelop = screen.getByRole('heading', { name: 'Skills to develop' })
      .parentElement as HTMLElement;
    expect(
      within(toDevelop)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['TypeScript', 'Figma']);
    expect(document.title).toBe('Vue Developer · JobQuest');
  });

  it('asks for skills before showing a match', async () => {
    installFakeApi({ jobs: [job] });

    await renderApp(`/jobs/${job.id}`);

    expect(await screen.findByText(/to see your match/)).toBeVisible();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('goes back to the list as it was, search included', async () => {
    installFakeApi({ jobs: [job, fakeJob({ title: 'Analyst' })] });
    const { router, user } = await renderApp('/jobs?q=vue');

    await user.click(
      await screen.findByRole('link', { name: 'View Vue Developer at Saltwater Digital' })
    );
    await user.click(await screen.findByRole('button', { name: 'Back to job listings' }));

    await screen.findByRole('table');
    expect(router.currentRoute.value.fullPath).toBe('/jobs?q=vue');
  });

  it('says when the job does not exist, or no longer does', async () => {
    installFakeApi({ jobs: [job] });

    await renderApp('/jobs/no-such-job');

    expect(await screen.findByRole('heading', { name: 'Job not found' })).toBeVisible();
  });
});
