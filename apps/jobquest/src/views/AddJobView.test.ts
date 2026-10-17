import { screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { fakeSkill, installFakeApi } from '../test/fakeApi';
import { renderApp } from '../test/renderApp';

describe('Add Job', () => {
  it('asks for a title and company first, with focus on the first missing field', async () => {
    const api = installFakeApi();
    const { user } = await renderApp('/jobs/new');

    await user.click(await screen.findByRole('button', { name: 'Add job' }));

    expect(screen.getByText('Enter a job title')).toBeVisible();
    expect(screen.getByText('Enter a company')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Job title (required)' })).toHaveFocus();
    expect(api.writes()).toEqual([]);
  });

  it('refuses a posting address that is not a web address', async () => {
    const api = installFakeApi();
    const { user } = await renderApp('/jobs/new');

    await user.type(await screen.findByRole('textbox', { name: 'Job title (required)' }), 'Tester');
    await user.type(screen.getByRole('textbox', { name: 'Company (required)' }), 'Example Co');
    await user.type(
      screen.getByRole('textbox', { name: 'Job posting address' }),
      'javascript:alert(1)'
    );
    await user.click(screen.getByRole('button', { name: 'Add job' }));

    expect(screen.getByText('Enter a web address starting with http:// or https://')).toBeVisible();
    expect(api.writes()).toEqual([]);
  });

  it('adds the job, splitting the lists, and opens it with the visitor’s match', async () => {
    const api = installFakeApi({ skills: [fakeSkill('Vue')] });
    const { router, user } = await renderApp('/jobs/new');

    await user.type(
      await screen.findByRole('textbox', { name: 'Job title (required)' }),
      'Vue Developer'
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Company (required)' }),
      'Saltwater Digital'
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Seniority' }), 'Senior');
    await user.type(screen.getByRole('textbox', { name: 'Skills' }), 'Vue, TypeScript, , Vue');
    await user.type(
      screen.getByRole('textbox', { name: 'Key requirements' }),
      '3+ years, ideally 5{Enter}Australian work rights'
    );
    await user.click(screen.getByRole('button', { name: 'Add job' }));

    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: '/api/jobs',
        body: expect.objectContaining({
          title: 'Vue Developer',
          company: 'Saltwater Digital',
          seniorityLevel: 'senior',
          skills: ['Vue', 'TypeScript'],
          software: [],
          requirements: ['3+ years, ideally 5', 'Australian work rights'],
          url: null,
        }),
      },
    ]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Vue Developer' })).toBeVisible();
    expect(router.currentRoute.value.name).toBe('job');
    expect(screen.getByText('50%')).toBeVisible();
    expect(screen.getByText('Added Vue Developer at Saltwater Digital.')).toBeVisible();
  });
});
