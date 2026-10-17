import { screen, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { fakeJob, installFakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

const jobs = [
  fakeJob({ category: 'Technology', skills: ['JS', 'Leadership'], software: ['Docker'] }),
  fakeJob({ category: 'Technology', skills: ['JavaScript'], software: [] }),
  fakeJob({ category: 'Design', skills: ['Figma', 'Leadership'], software: [] }),
];

/** A table's rows as arrays of cell text. */
const rowsOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim()));

describe('Analytics', () => {
  it('shows the skills in demand and the groups by category as tables', async () => {
    installFakeApi({ jobs });

    await renderApp('/analytics?view=table');

    const demand = await screen.findByRole('table', { name: 'Skills in demand, by group' });
    expect(rowsOf(demand)).toEqual([
      ['Skill', 'Jobs'],
      ['Soft skills (2)'],
      ['leadership', '2'],
      ['Cloud and platforms (1)'],
      ['docker', '1'],
      ['Dev and data (2)'],
      ['javascript', '2'],
      ['Other (1)'],
      ['figma', '1'],
    ]);
    const byCategory = screen.getByRole('table', { name: 'Skill groups by job category' });
    expect(rowsOf(byCategory)[0]).toEqual(['Skill group', 'Design', 'Technology']);
    expect(rowsOf(byCategory)[1]).toEqual(['Soft skills', '1', '1']);
    expect(screen.getByRole('button', { name: 'Show as tables' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('leaves out a job category, keeping the choice in the URL', async () => {
    installFakeApi({ jobs });
    const { router, user } = await renderApp('/analytics?view=table');

    await user.click(await screen.findByRole('button', { name: 'Design (1)' }));

    expect(screen.getByRole('button', { name: 'Design (1)' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(router.currentRoute.value.query).toEqual({ view: 'table', hide: ['Design'] });
    expect(screen.getByText('What your saved jobs ask for: 2 of 3 jobs.')).toBeVisible();
    const demand = screen.getByRole('table', { name: 'Skills in demand, by group' });
    expect(within(demand).queryByText('figma')).not.toBeInTheDocument();
  });

  it('switches between charts and tables', async () => {
    installFakeApi({ jobs });
    const { router, user } = await renderApp('/analytics');

    const toggle = await screen.findByRole('button', { name: 'Show as tables' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // The charts are a lazy chunk; ECharts' first import in a test run is slow
    const caption = await screen.findByText('Skills in demand, by group', {}, { timeout: 15_000 });
    expect(caption.tagName).toBe('FIGCAPTION');

    await user.click(toggle);

    expect(router.currentRoute.value.query).toEqual({ view: 'table' });
    expect(screen.getByRole('table', { name: 'Skills in demand, by group' })).toBeVisible();
  }, 20_000); // Loads the ECharts chunk, which is slow when every app's tests run at once

  it('points to Add Job when there are no jobs', async () => {
    installFakeApi({ jobs: [] });

    await renderApp('/analytics');

    expect(
      await screen.findByText('Add some jobs to see which skills and tools come up most.')
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show as tables' })).not.toBeInTheDocument();
  });
});
