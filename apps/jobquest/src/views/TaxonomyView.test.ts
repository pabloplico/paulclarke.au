import { screen, waitFor, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import type { Taxonomy } from '../../shared/types';
import { fakeJob, installFakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

const taxonomy: Taxonomy = {
  categories: [{ id: 'web', name: 'Web', color: '#4f46e5' }],
  canonicalMap: { js: 'javascript' },
  skillGroups: { javascript: ['web'] },
};
const jobs = [
  fakeJob({ skills: ['JavaScript', 'ReactJS'], software: ['Figma'] }),
  fakeJob({ skills: ['React'], software: [] }),
];

/** The taxonomies the page sent, in order. */
const puts = (api: ReturnType<typeof installFakeApi>) =>
  api.writes().map((request) => request.body as Taxonomy);

describe('Taxonomy', () => {
  it('merges one skill into another, and says so', async () => {
    const api = installFakeApi({ jobs, taxonomy });
    const { user } = await renderApp('/taxonomy');

    await user.type(await screen.findByRole('combobox', { name: 'Count this skill' }), 'ReactJS');
    await user.type(screen.getByRole('combobox', { name: 'as' }), 'React');
    await user.click(screen.getByRole('button', { name: 'Merge' }));

    expect(puts(api)).toEqual([
      { ...taxonomy, canonicalMap: { js: 'javascript', reactjs: 'react' } },
    ]);
    expect(await screen.findByText('reactjs now counts as react.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Stop counting reactjs as react' })).toBeVisible();
  });

  it('refuses a merge that changes nothing, without saving', async () => {
    const api = installFakeApi({ jobs, taxonomy });
    const { user } = await renderApp('/taxonomy');

    await user.type(await screen.findByRole('combobox', { name: 'Count this skill' }), 'JS');
    await user.type(screen.getByRole('combobox', { name: 'as' }), 'JavaScript');
    await user.click(screen.getByRole('button', { name: 'Merge' }));

    expect(screen.getByText('js already counts as javascript.')).toBeVisible();
    expect(api.writes()).toEqual([]);
  });

  it('undoes a merge', async () => {
    const api = installFakeApi({ jobs, taxonomy });
    const { user } = await renderApp('/taxonomy');

    await user.click(await screen.findByRole('button', { name: 'Stop counting js as javascript' }));

    expect(puts(api)).toEqual([{ ...taxonomy, canonicalMap: {} }]);
    expect(await screen.findByText('No merged skills yet.')).toBeVisible();
  });

  it('puts an ungrouped skill in a group, and takes it out again', async () => {
    const api = installFakeApi({ jobs, taxonomy });
    const { user } = await renderApp('/taxonomy');

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Group for figma' }),
      'Web'
    );
    await user.click(screen.getByRole('button', { name: 'Add figma to the group' }));
    const web = await screen.findByRole('list', { name: 'Skills in Web' });
    await waitFor(() => expect(within(web).getByText('figma')).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Take figma out of Web' }));

    expect(puts(api).map((sent) => sent.skillGroups)).toEqual([
      { javascript: ['web'], figma: ['web'] },
      { javascript: ['web'] },
    ]);
  });

  it('adds and deletes groups', async () => {
    const api = installFakeApi({ jobs, taxonomy });
    const { user } = await renderApp('/taxonomy');

    await user.type(await screen.findByRole('textbox', { name: 'New group' }), 'Design');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Colour' }), 'Rose');
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await user.click(await screen.findByRole('button', { name: 'Delete the group Web' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete the group Web' }));

    expect(puts(api)).toEqual([
      {
        ...taxonomy,
        categories: [...taxonomy.categories, { id: 'design', name: 'Design', color: '#be123c' }],
      },
      {
        ...taxonomy,
        categories: [{ id: 'design', name: 'Design', color: '#be123c' }],
        skillGroups: {},
      },
    ]);
    await user.type(screen.getByRole('textbox', { name: 'New group' }), 'design');
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    expect(screen.getByText("There's already a group called design.")).toBeVisible();
  });

  it('sends quick edits one at a time, each building on the last', async () => {
    const api = installFakeApi({ jobs, taxonomy });
    const { user } = await renderApp('/taxonomy');
    const release = api.holdWrites();

    await user.click(await screen.findByRole('button', { name: 'Stop counting js as javascript' }));
    await user.click(screen.getByRole('button', { name: 'Take javascript out of Web' }));

    // The second edit shows at once but waits to be sent until the first is saved
    expect(screen.getByText('No merged skills yet.')).toBeVisible();
    expect(api.writes()).toHaveLength(1);

    release();

    await waitFor(() => expect(api.writes()).toHaveLength(2));
    expect(puts(api)).toEqual([
      { ...taxonomy, canonicalMap: {} },
      { ...taxonomy, canonicalMap: {}, skillGroups: {} },
    ]);
    await waitFor(() => expect(api.state.taxonomy).toEqual(puts(api)[1]));
  });
});
