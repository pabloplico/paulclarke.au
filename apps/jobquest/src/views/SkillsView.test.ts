import { screen, waitFor, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { fakeJob, fakeSkill, installFakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

const jobs = [
  fakeJob({ skills: ['Vue', 'CSS'], software: ['Figma'] }),
  fakeJob({ skills: ['Vue', 'Accessibility'], software: [] }),
];

const skillList = () => screen.getByRole('list', { name: 'Your skills' });

describe('My Skills & Gaps', () => {
  it('adds a skill at the chosen level', async () => {
    const api = installFakeApi({ jobs });
    const { user } = await renderApp('/skills');

    await user.type(await screen.findByRole('textbox', { name: 'Skill' }), 'TypeScript');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Level' }), 'Senior');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: '/api/skills',
        body: { name: 'TypeScript', proficiency: 4, category: null },
      },
    ]);
    expect(await within(skillList()).findByText('TypeScript')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Skill' })).toHaveValue('');
  });

  it('refuses a skill the visitor already has, saying which, without calling the server', async () => {
    const api = installFakeApi({ jobs, skills: [fakeSkill('JavaScript')] });
    const { user } = await renderApp('/skills');
    const input = await screen.findByRole('textbox', { name: 'Skill' });

    await user.type(input, 'JS');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('You already have JavaScript.')).toBeVisible();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(api.writes()).toEqual([]);
  });

  it('asks for a name before adding', async () => {
    const api = installFakeApi({ jobs });
    const { user } = await renderApp('/skills');

    await user.click(await screen.findByRole('button', { name: 'Add' }));

    expect(screen.getByText('Enter a skill')).toBeVisible();
    expect(api.writes()).toEqual([]);
  });

  it('changes a skill’s level and removes a skill', async () => {
    const vue = fakeSkill('Vue', 2);
    const api = installFakeApi({ jobs, skills: [vue] });
    const { user } = await renderApp('/skills');

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Level for Vue' }),
      'Expert'
    );
    await user.click(screen.getByRole('button', { name: 'Remove Vue from your skills' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove Vue from your skills' }));

    expect(api.writes()).toEqual([
      { method: 'PATCH', path: `/api/skills/${vue.id}`, body: { proficiency: 5 } },
      { method: 'DELETE', path: `/api/skills/${vue.id}` },
    ]);
    expect(await screen.findByText('Add your current skills to start the analysis.')).toBeVisible();
  });

  it('compares the visitor’s skills with their jobs, and adds a gap in one click', async () => {
    const api = installFakeApi({ jobs, skills: [fakeSkill('Vue')] });
    const { user } = await renderApp('/skills');

    const matched = await screen.findByRole('region', { name: 'Matched with the market' });
    const gaps = screen.getByRole('region', { name: 'Your biggest gaps' });
    await waitFor(() => expect(within(matched).getByText('vue')).toBeVisible());
    expect(within(matched).getByText('In 2 jobs')).toBeVisible();
    expect(
      within(gaps)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim())
    ).toEqual(['css In 1 job', 'figma In 1 job', 'accessibility In 1 job']);

    await user.click(within(gaps).getByRole('button', { name: 'I have css: add it to my skills' }));

    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: '/api/skills',
        body: { name: 'css', proficiency: 3, category: null },
      },
    ]);
    await waitFor(() => expect(within(gaps).queryByText('css')).not.toBeInTheDocument());
  });

  it('shows a new visitor how it works, until they add a skill', async () => {
    installFakeApi({ jobs });
    const { user } = await renderApp('/skills');

    const steps = await screen.findByRole('region', { name: 'How it works' });
    expect(
      within(steps)
        .getAllByRole('heading', { level: 3 })
        .map((step) => step.textContent)
    ).toEqual(['Add your skills', 'Collect jobs', 'Spot trends', 'Close the gap']);
    expect(within(steps).getByRole('link', { name: 'Read the full guide' })).toHaveAttribute(
      'href',
      '/help'
    );

    await user.type(screen.getByRole('textbox', { name: 'Skill' }), 'Vue');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'How it works' })).not.toBeInTheDocument()
    );
  });

  it('points to Add Job when there are no jobs to compare with', async () => {
    installFakeApi({ jobs: [] });

    await renderApp('/skills');

    expect(await screen.findByText("Add jobs to see which skills you're missing.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add a job' })).toHaveAttribute('href', '/jobs/new');
  });
});
