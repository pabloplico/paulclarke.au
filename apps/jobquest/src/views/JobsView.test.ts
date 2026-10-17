import { screen, waitFor, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { fakeJob, fakeSkill, installFakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

const jobs = [
  fakeJob({
    title: 'Vue Developer',
    company: 'Saltwater Digital',
    category: 'Technology',
    seniorityLevel: 'mid',
    skills: ['Vue', 'CSS'],
    dateAdded: '2026-10-03T00:00:00.000Z',
  }),
  fakeJob({
    title: 'UI Engineer',
    company: 'Lumen & Reed',
    category: 'Design',
    seniorityLevel: 'senior',
    skills: ['Figma'],
    dateAdded: '2026-10-02T00:00:00.000Z',
  }),
  fakeJob({
    title: 'Analyst',
    company: 'Tidepool Analytics',
    category: 'Technology',
    seniorityLevel: 'junior',
    skills: ['SQL', 'Vue'],
    dateAdded: '2026-10-01T00:00:00.000Z',
  }),
];

/** Job titles in the order the table shows them. */
const shownTitles = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('link')[0]?.textContent?.trim());

describe('Job Listings', () => {
  it('lists the jobs newest first, with the match for the visitor’s skills', async () => {
    installFakeApi({ jobs, skills: [fakeSkill('Vue')] });

    await renderApp('/jobs');

    await screen.findByRole('table');
    expect(shownTitles()).toEqual(['Vue Developer', 'UI Engineer', 'Analyst']);
    const firstRow = screen.getAllByRole('row')[1] as HTMLElement;
    expect(within(firstRow).getByText('50%')).toBeVisible();
    expect(screen.getByText('Showing 3 of 3 jobs')).toBeVisible();
  });

  it('searches title and company, keeping the search in the URL', async () => {
    installFakeApi({ jobs });
    const { router, user } = await renderApp('/jobs');

    await user.type(
      await screen.findByRole('searchbox', { name: 'Search title or company' }),
      'lumen'
    );

    expect(shownTitles()).toEqual(['UI Engineer']);
    expect(router.currentRoute.value.query).toEqual({ q: 'lumen' });
    expect(screen.getByText('Showing 1 of 3 jobs')).toBeVisible();
  });

  it('opens with the filters from the URL, and clears them', async () => {
    installFakeApi({ jobs });
    const { router, user } = await renderApp('/jobs?category=Technology&level=junior');

    await screen.findByRole('table');
    expect(shownTitles()).toEqual(['Analyst']);
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('Technology');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(shownTitles()).toHaveLength(3);
    expect(router.currentRoute.value.query).toEqual({});
  });

  it('says when nothing matches the filters', async () => {
    installFakeApi({ jobs });

    await renderApp('/jobs?q=nothing-like-this');

    expect(await screen.findByText('No jobs match your search or filters.')).toBeVisible();
  });

  it('sorts by title from the column header, and says how it is sorted', async () => {
    installFakeApi({ jobs });
    const { router, user } = await renderApp('/jobs');
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Job' }));

    expect(shownTitles()).toEqual(['Analyst', 'UI Engineer', 'Vue Developer']);
    expect(screen.getByRole('columnheader', { name: 'Job' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(router.currentRoute.value.query).toEqual({ sort: 'title', dir: 'asc' });
  });

  it('edits a job in a dialog and saves only valid changes', async () => {
    const api = installFakeApi({ jobs });
    const { user } = await renderApp('/jobs');

    await user.click(
      await screen.findByRole('button', { name: 'Edit UI Engineer at Lumen & Reed' })
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit UI Engineer' });
    const title = within(dialog).getByRole('textbox', { name: 'Job title (required)' });
    await user.clear(title);
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(within(dialog).getByText('Enter a job title')).toBeVisible();
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(api.writes()).toEqual([]);

    await user.type(title, 'Design Systems Engineer');
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes' }), 'Call back Monday');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(dialog).not.toBeVisible());
    expect(api.writes()).toEqual([
      {
        method: 'PATCH',
        path: `/api/jobs/${jobs[1]?.id}`,
        body: expect.objectContaining({
          title: 'Design Systems Engineer',
          company: 'Lumen & Reed',
          notes: 'Call back Monday',
          skills: ['Figma'],
        }),
      },
    ]);
    expect(await screen.findByText('Saved Design Systems Engineer.')).toBeVisible();
    expect(shownTitles()).toContain('Design Systems Engineer');
  });

  it('deletes a job after a second click, and Escape backs out', async () => {
    const api = installFakeApi({ jobs });
    const { user } = await renderApp('/jobs');
    const bin = await screen.findByRole('button', { name: 'Delete Analyst at Tidepool Analytics' });

    await user.click(bin);
    expect(
      screen.getByRole('button', { name: 'Yes, delete Analyst at Tidepool Analytics' })
    ).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: 'Delete Analyst at Tidepool Analytics' })
    ).toHaveFocus();
    expect(api.writes()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Delete Analyst at Tidepool Analytics' }));
    await user.click(
      screen.getByRole('button', { name: 'Yes, delete Analyst at Tidepool Analytics' })
    );

    expect(api.writes()).toEqual([{ method: 'DELETE', path: `/api/jobs/${jobs[2]?.id}` }]);
    await waitFor(() => expect(shownTitles()).toEqual(['Vue Developer', 'UI Engineer']));
    expect(await screen.findByText('Deleted Analyst at Tidepool Analytics.')).toBeVisible();
  });
});
