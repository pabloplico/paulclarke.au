// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_TAXONOMY } from '../../shared/skillMatcher';
import { analyticsGroup, groupsByCategory, skillsByGroup } from './analytics';

describe('analyticsGroup', () => {
  it('puts a skill in the first group with a keyword it contains', () => {
    expect(analyticsGroup('Stakeholder management')).toBe('Soft skills');
    expect(analyticsGroup('Root cause analysis')).toBe('Analytical skills');
    expect(analyticsGroup('Jira')).toBe('Delivery and ops');
    expect(analyticsGroup('Excel')).toBe('Productivity and enterprise');
    expect(analyticsGroup('Kubernetes')).toBe('Cloud and platforms');
    expect(analyticsGroup('TypeScript')).toBe('Dev and data');
    expect(analyticsGroup('Figma')).toBe('Other');
  });

  // Ported as it was: the keywords are substrings, so these are quirks, not intent
  it('matches keywords inside words, and needs a space after "r"', () => {
    expect(analyticsGroup('GitHub')).toBe('Dev and data');
    expect(analyticsGroup('Digital marketing')).toBe('Dev and data');
    expect(analyticsGroup('Javascript testing')).toBe('Dev and data');
    expect(analyticsGroup('r ')).toBe('Dev and data');
    expect(analyticsGroup('R')).toBe('Other');
  });
});

describe('skillsByGroup', () => {
  it('groups demand by canonical name, so merged skills count together', () => {
    const jobs = [
      { skills: ['JS', 'Leadership'], software: ['Figma'] },
      { skills: ['JavaScript'], software: [] },
    ];

    expect(skillsByGroup(jobs, DEFAULT_TAXONOMY)).toEqual([
      { group: 'Soft skills', skills: [{ name: 'leadership', count: 1 }], total: 1 },
      { group: 'Dev and data', skills: [{ name: 'javascript', count: 2 }], total: 2 },
      { group: 'Other', skills: [{ name: 'figma', count: 1 }], total: 1 },
    ]);
  });
});

describe('groupsByCategory', () => {
  it('counts each skill once per job, per job category, for every group but Other', () => {
    const jobs = [
      { category: 'Technology', skills: ['JS', 'JavaScript', 'Docker'], software: ['Figma'] },
      { category: 'Technology', skills: ['Python'], software: [] },
      { category: null, skills: ['Teamwork'], software: [] },
    ];

    expect(groupsByCategory(jobs, DEFAULT_TAXONOMY)).toEqual({
      groups: [
        'Soft skills',
        'Analytical skills',
        'Delivery and ops',
        'Productivity and enterprise',
        'Cloud and platforms',
        'Dev and data',
      ],
      categories: [
        { name: 'Other', values: [1, 0, 0, 0, 0, 0] },
        { name: 'Technology', values: [0, 0, 0, 0, 1, 2] },
      ],
    });
  });
});
