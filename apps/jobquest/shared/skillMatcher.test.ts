// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  calculateSimilarity,
  countSkillDemand,
  DEFAULT_TAXONOMY,
  findBestMatch,
  getSkillGroups,
  matchSkills,
  normalizeSkill,
} from './skillMatcher';

const taxonomy = DEFAULT_TAXONOMY;

describe('normalizeSkill', () => {
  it('lower-cases, trims and maps synonyms to their canonical name', () => {
    expect(normalizeSkill('  JS ', taxonomy)).toBe('javascript');
    expect(normalizeSkill('Postgres', taxonomy)).toBe('postgresql');
    expect(normalizeSkill('Kubernetes', taxonomy)).toBe('kubernetes');
  });
});

describe('getSkillGroups', () => {
  it('returns the groups of the canonical skill, or none', () => {
    expect(getSkillGroups('TS', taxonomy)).toEqual(['frontend', 'programming-language']);
    expect(getSkillGroups('Kubernetes', taxonomy)).toEqual([]);
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
    expect(matchSkills(' React ', 'react', taxonomy)).toEqual({
      matched: true,
      confidence: 100,
      method: 'exact',
      normalizedSkill: 'react',
    });
  });

  it('matches synonyms through the canonical map', () => {
    expect(matchSkills('JS', 'JavaScript', taxonomy)).toEqual({
      matched: true,
      confidence: 95,
      method: 'normalized',
      normalizedSkill: 'javascript',
    });
  });

  it('matches near-misses at 85% similarity or more, capped at 90', () => {
    expect(matchSkills('Kubernets', 'Kubernetes', taxonomy)).toEqual({
      matched: true,
      confidence: 90,
      method: 'fuzzy',
      normalizedSkill: 'kubernetes',
    });
  });

  it('matches when one skill contains the other at 80', () => {
    expect(matchSkills('React', 'React Native', taxonomy)).toEqual({
      matched: true,
      confidence: 80,
      method: 'fuzzy',
      normalizedSkill: 'react native',
    });
  });

  it("doesn't match short shared words, and reports the similarity", () => {
    expect(matchSkills('Python', 'Excel', taxonomy)).toEqual({
      matched: false,
      confidence: 0,
      method: 'none',
    });
    expect(matchSkills('Go', 'Google Ads', taxonomy).matched).toBe(true); // 'google ads' contains 'go'
    expect(matchSkills('UX', 'Excel', taxonomy).matched).toBe(false);
  });
});

describe('findBestMatch', () => {
  it('picks the most confident match, or null when nothing matches', () => {
    expect(findBestMatch('react', ['React Native', 'React'], taxonomy)).toMatchObject({
      method: 'exact',
      confidence: 100,
    });
    expect(findBestMatch('react', ['Python', 'Excel'], taxonomy)).toBeNull();
  });
});

describe('countSkillDemand', () => {
  const jobs = [
    { skills: ['JS', 'React'], software: ['javascript'] },
    { skills: ['react'], software: [] },
  ];

  it('counts each job once per canonical skill, most-mentioned first', () => {
    expect(countSkillDemand(jobs, taxonomy)).toEqual([
      { name: 'react', count: 2 },
      { name: 'javascript', count: 1 },
    ]);
  });

  it('reads only the fields asked for', () => {
    expect(countSkillDemand(jobs, taxonomy, ['software'])).toEqual([
      { name: 'javascript', count: 1 },
    ]);
  });
});

describe("a profile's own taxonomy", () => {
  it('replaces the default maps rather than adding to them', () => {
    const own = { canonicalMap: { k8s: 'kubernetes' }, skillGroups: { kubernetes: ['ops'] } };

    expect(normalizeSkill('K8s', own)).toBe('kubernetes');
    expect(getSkillGroups('k8s', own)).toEqual(['ops']);
    expect(normalizeSkill('JS', own)).toBe('js');
    expect(countSkillDemand([{ skills: ['k8s', 'Kubernetes'], software: [] }], own)).toEqual([
      { name: 'kubernetes', count: 1 },
    ]);
  });
});
