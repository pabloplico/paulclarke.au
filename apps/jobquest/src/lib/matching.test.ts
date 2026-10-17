// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_TAXONOMY } from '../../shared/skillMatcher';
import { duplicateOf, marketFit, matchJob, TOP_GAPS } from './matching';

const taxonomy = DEFAULT_TAXONOMY;

describe('matchJob', () => {
  it("splits the job's skills and software into ones the visitor has and lacks", () => {
    const job = { skills: ['JavaScript', 'Vue', 'GraphQL'], software: ['Git'] };

    expect(matchJob(job, ['JS', 'git'], taxonomy)).toEqual({
      matched: ['JavaScript', 'Git'],
      missing: ['Vue', 'GraphQL'],
      percentage: 50,
    });
  });

  it('has no percentage when there is nothing to compare', () => {
    expect(matchJob({ skills: [], software: [] }, ['Vue'], taxonomy).percentage).toBeNull();
    expect(matchJob({ skills: ['Vue'], software: [] }, [], taxonomy).percentage).toBeNull();
  });
});

describe('marketFit', () => {
  it('lists matched skills and the most wanted gaps, by how many jobs ask', () => {
    const jobs = [
      { skills: ['Vue', 'CSS'], software: ['Figma'] },
      { skills: ['Vue', 'Accessibility'], software: [] },
      { skills: ['CSS'], software: [] },
    ];

    expect(marketFit(jobs, ['vue'], taxonomy)).toEqual({
      matched: [{ name: 'vue', count: 2 }],
      gaps: [
        { name: 'css', count: 2 },
        { name: 'figma', count: 1 },
        { name: 'accessibility', count: 1 },
      ],
    });
  });

  it(`lists at most ${TOP_GAPS} gaps`, () => {
    const jobs = [{ skills: Array.from({ length: 20 }, (_, i) => `Skill ${i}`), software: [] }];

    expect(marketFit(jobs, [], taxonomy).gaps).toHaveLength(TOP_GAPS);
  });
});

describe('duplicateOf', () => {
  const skills = [{ name: 'React' }, { name: 'JavaScript' }, { name: 'Kubernetes' }];

  it('finds the skill an exact, synonym or near-typo name would duplicate', () => {
    expect(duplicateOf('react', skills, taxonomy)).toEqual({ name: 'React' });
    expect(duplicateOf('JS', skills, taxonomy)).toEqual({ name: 'JavaScript' });
    expect(duplicateOf('Kubernets', skills, taxonomy)).toEqual({ name: 'Kubernetes' });
  });

  it('allows a skill that only contains one the visitor has', () => {
    expect(duplicateOf('React Native', skills, taxonomy)).toBeUndefined();
    expect(duplicateOf('Vue', skills, taxonomy)).toBeUndefined();
  });
});
