// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { countSkillDemand } from '../../shared/skillMatcher';
import { type Taxonomy, taxonomySchema } from '../../shared/types';
import {
  addGroup,
  addToGroup,
  allGroups,
  countAs,
  mergesByCanonical,
  removeFromGroup,
  removeGroup,
  skillsInGroup,
  stopCountingAs,
  type TaxonomyEdit,
} from './taxonomy';

const base: Taxonomy = {
  categories: [{ id: 'web', name: 'Web', color: '#4f46e5' }],
  canonicalMap: { js: 'javascript' },
  skillGroups: { javascript: ['web'], 'react native': ['mobile'] },
};

/** The taxonomy from an edit that should succeed, checked against the API's rules. */
function ok(edit: TaxonomyEdit): Taxonomy {
  if ('error' in edit) throw new Error(edit.error);
  expect(taxonomySchema.safeParse(edit.taxonomy).success).toBe(true);
  return edit.taxonomy;
}

describe('countAs', () => {
  it('merges two skills, which changes the demand counts', () => {
    const jobs = [
      { skills: ['React', 'CSS'], software: [] },
      { skills: ['ReactJS'], software: [] },
    ];
    expect(countSkillDemand(jobs, base)).toEqual([
      { name: 'react', count: 1 },
      { name: 'css', count: 1 },
      { name: 'reactjs', count: 1 },
    ]);

    const merged = ok(countAs(base, 'ReactJS', 'React'));

    expect(merged.canonicalMap).toEqual({ js: 'javascript', reactjs: 'react' });
    expect(countSkillDemand(jobs, merged)).toEqual([
      { name: 'react', count: 2 },
      { name: 'css', count: 1 },
    ]);
  });

  it('follows the target to its own name, so there are never chains', () => {
    const merged = ok(countAs(base, 'ecmascript', 'JS'));

    expect(merged.canonicalMap).toEqual({ js: 'javascript', ecmascript: 'javascript' });
  });

  it('renames a skill: its synonyms and groups move to the new name', () => {
    const renamed = ok(countAs(base, 'javascript', 'JavaScript (ES2023)'));

    expect(renamed.canonicalMap).toEqual({
      js: 'javascript (es2023)',
      javascript: 'javascript (es2023)',
    });
    expect(renamed.skillGroups).toEqual({
      'javascript (es2023)': ['web'],
      'react native': ['mobile'],
    });
  });

  it('refuses a merge that would loop or change nothing', () => {
    expect(countAs(base, 'javascript', 'js')).toEqual({
      error: 'javascript already counts as javascript.',
    });
    expect(countAs(base, 'JS', 'javascript')).toEqual({
      error: 'js already counts as javascript.',
    });
    expect(countAs(base, ' ', 'react')).toEqual({ error: 'Enter both skills.' });
  });
});

describe('stopCountingAs', () => {
  it('makes a synonym count as itself again', () => {
    expect(stopCountingAs(base, 'JS').canonicalMap).toEqual({});
  });
});

describe('mergesByCanonical', () => {
  it('lists synonyms under the name they count as', () => {
    const taxonomy = ok(countAs(base, 'es6', 'javascript'));

    expect(mergesByCanonical(taxonomy)).toEqual([
      { canonical: 'javascript', synonyms: ['es6', 'js'] },
    ]);
  });
});

describe('groups', () => {
  it('lists named groups, then ids skills use without a name', () => {
    expect(allGroups(base)).toEqual([
      { id: 'web', name: 'Web', color: '#4f46e5' },
      { id: 'mobile', name: 'mobile', color: '#6b7280' },
    ]);
  });

  it('adds a group with an id from its name, refusing a name that exists', () => {
    const added = ok(addGroup(base, ' Data & AI ', '#0f766e'));

    expect(added.categories).toContainEqual({ id: 'data-ai', name: 'Data & AI', color: '#0f766e' });
    expect(addGroup(base, 'web', '#000000')).toEqual({
      error: "There's already a group called web.",
    });
    expect(addGroup(base, 'Mobile', '#000000')).toEqual({
      error: "There's already a group called Mobile.",
    });
  });

  it('puts skills in groups by their canonical name, and takes them out', () => {
    const grouped = addToGroup(base, 'JS', 'mobile');

    expect(grouped.skillGroups.javascript).toEqual(['web', 'mobile']);
    expect(skillsInGroup(grouped, 'mobile')).toEqual(['javascript', 'react native']);

    const ungrouped = removeFromGroup(
      removeFromGroup(grouped, 'javascript', 'web'),
      'js',
      'mobile'
    );
    expect(ungrouped.skillGroups).toEqual({ 'react native': ['mobile'] });
  });

  it('deletes a group and takes every skill out of it', () => {
    const removed = removeGroup(addToGroup(base, 'react native', 'web'), 'web');

    expect(removed.categories).toEqual([]);
    expect(removed.skillGroups).toEqual({ 'react native': ['mobile'] });
  });
});
