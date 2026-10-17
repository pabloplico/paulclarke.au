// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  calculateSimilarity,
  configureTaxonomy,
  countSkillDemand,
  DEFAULT_SKILL_CANONICAL_MAP,
  DEFAULT_SKILL_GROUPS,
  findBestMatch,
  getSkillGroups,
  matchSkills,
  normalizeSkill,
} from './skillMatcher';

afterEach(() => {
  configureTaxonomy({
    canonicalMap: DEFAULT_SKILL_CANONICAL_MAP,
    skillGroups: DEFAULT_SKILL_GROUPS,
  });
});

describe('normalizeSkill', () => {
  it('lower-cases, trims and maps synonyms to their canonical name', () => {
    expect(normalizeSkill('  JS ')).toBe('javascript');
    expect(normalizeSkill('Postgres')).toBe('postgresql');
    expect(normalizeSkill('Kubernetes')).toBe('kubernetes');
  });
});

describe('getSkillGroups', () => {
  it('returns the groups of the canonical skill, or none', () => {
    expect(getSkillGroups('TS')).toEqual(['frontend', 'programming-language']);
    expect(getSkillGroups('Kubernetes')).toEqual([]);
  });
});

describe('calculateSimilarity', () => {
  it('is 100 for identical or empty strings and drops with each edit', () => {
    expect(calculateSimilarity('react', 'react')).toBe(100);
    expect(calculateSimilarity('', '')).toBe(100);
    expect(calculateSimilarity('kubernetes', 'kubernets')).toBe(90);
    expect(calculateSimilarity('python', 'excel')).toBe(0);
  });
});

describe('matchSkills', () => {
  it('matches exactly, ignoring case and spaces', () => {
    expect(matchSkills(' React ', 'react')).toEqual({
      matched: true,
      confidence: 100,
      method: 'exact',
      normalizedSkill: 'react',
    });
  });

  it('matches synonyms through the canonical map', () => {
    expect(matchSkills('JS', 'JavaScript')).toEqual({
      matched: true,
      confidence: 95,
      method: 'normalized',
      normalizedSkill: 'javascript',
    });
  });

  it('matches near-misses at 85% similarity or more, capped at 90', () => {
    expect(matchSkills('Kubernets', 'Kubernetes')).toEqual({
      matched: true,
      confidence: 90,
      method: 'fuzzy',
      normalizedSkill: 'kubernetes',
    });
  });

  it('matches when one skill contains the other at 80', () => {
    expect(matchSkills('React', 'React Native')).toEqual({
      matched: true,
      confidence: 80,
      method: 'fuzzy',
      normalizedSkill: 'react native',
    });
  });

  it("doesn't match short shared words, and reports the similarity", () => {
    expect(matchSkills('Python', 'Excel')).toEqual({
      matched: false,
      confidence: 0,
      method: 'none',
    });
    expect(matchSkills('Go', 'Google Ads').matched).toBe(true); // 'google ads' contains 'go'
    expect(matchSkills('UX', 'Excel').matched).toBe(false);
  });
});

describe('findBestMatch', () => {
  it('picks the most confident match, or null when nothing matches', () => {
    expect(findBestMatch('react', ['React Native', 'React'])).toMatchObject({
      method: 'exact',
      confidence: 100,
    });
    expect(findBestMatch('react', ['Python', 'Excel'])).toBeNull();
  });
});

describe('countSkillDemand', () => {
  const jobs = [
    { skills: ['JS', 'React'], software: ['javascript'] },
    { skills: ['react'], software: [] },
  ];

  it('counts each job once per canonical skill, most-mentioned first', () => {
    expect(countSkillDemand(jobs)).toEqual([
      { name: 'react', count: 2 },
      { name: 'javascript', count: 1 },
    ]);
  });

  it('reads only the fields asked for', () => {
    expect(countSkillDemand(jobs, ['software'])).toEqual([{ name: 'javascript', count: 1 }]);
  });
});

describe('configureTaxonomy', () => {
  it('replaces the default maps rather than adding to them', () => {
    configureTaxonomy({
      canonicalMap: { k8s: 'kubernetes' },
      skillGroups: { kubernetes: ['ops'] },
    });

    expect(normalizeSkill('K8s')).toBe('kubernetes');
    expect(getSkillGroups('k8s')).toEqual(['ops']);
    expect(normalizeSkill('JS')).toBe('js');
    expect(countSkillDemand([{ skills: ['k8s', 'Kubernetes'], software: [] }])).toEqual([
      { name: 'kubernetes', count: 1 },
    ]);
  });
});
