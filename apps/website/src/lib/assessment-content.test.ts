import { describe, expect, it } from 'vitest';
import {
  type AssessmentProfile,
  computeDimensionScore,
  computeResults,
  DIMENSION_QUESTIONS,
  DIMENSIONS,
  getReadinessLevelMeta,
  type MaturityLevel,
  READINESS_LEVELS,
  type ReadinessLevel,
  scoreToLevel,
} from './assessment-content';

const profile = (patch: Partial<AssessmentProfile> = {}): AssessmentProfile => ({
  industry: null,
  maturityLevel: null,
  painPoints: [],
  dimensionAnswers: {},
  ...patch,
});

/** Answer every question in every dimension with the same star rating. */
const answerAll = (stars: number) =>
  Object.fromEntries(DIMENSION_QUESTIONS.map((q) => [q.id, stars]));

describe('scoreToLevel', () => {
  it.each([
    [0, 'emerging'],
    [25, 'emerging'],
    [26, 'developing'],
    [50, 'developing'],
    [51, 'implementing'],
    [75, 'implementing'],
    [76, 'leading'],
    [100, 'leading'],
  ] as const)('maps %i to %s', (score, level) => {
    expect(scoreToLevel(score)).toBe(level);
  });

  it('agrees with the ranges shown to users in READINESS_LEVELS for every score 0–100', () => {
    for (let score = 0; score <= 100; score++) {
      const { range } = getReadinessLevelMeta(scoreToLevel(score));
      expect(score).toBeGreaterThanOrEqual(range[0]);
      expect(score).toBeLessThanOrEqual(range[1]);
    }
  });
});

describe('getReadinessLevelMeta', () => {
  it('has an entry for every readiness level', () => {
    const levels: ReadinessLevel[] = ['emerging', 'developing', 'implementing', 'leading'];
    for (const level of levels) expect(getReadinessLevelMeta(level).id).toBe(level);
    expect(READINESS_LEVELS).toHaveLength(levels.length);
  });
});

describe('computeDimensionScore', () => {
  const [first, second] = DIMENSION_QUESTIONS.filter((q) => q.dimension === 'strategy-leadership');

  it('is 0 when no question in the dimension is answered', () => {
    expect(computeDimensionScore('strategy-leadership', {})).toBe(0);
  });

  it('is 100 when every answered question has full stars', () => {
    expect(computeDimensionScore('strategy-leadership', answerAll(4))).toBe(100);
  });

  it('averages only the answered questions, as a percentage of 4 stars each', () => {
    if (!first || !second) throw new Error('expected two strategy-leadership questions');
    expect(computeDimensionScore('strategy-leadership', { [first.id]: 4, [second.id]: 2 })).toBe(
      75
    );
    // One answered question at 2/4 = 50%, the unanswered one is ignored
    expect(computeDimensionScore('strategy-leadership', { [first.id]: 2 })).toBe(50);
  });

  it('ignores answers to other dimensions', () => {
    const otherDimension = DIMENSION_QUESTIONS.find((q) => q.dimension !== 'strategy-leadership');
    if (!otherDimension) throw new Error('expected another dimension');
    expect(computeDimensionScore('strategy-leadership', { [otherDimension.id]: 4 })).toBe(0);
  });
});

describe('computeResults', () => {
  it('returns null until an industry is chosen', () => {
    expect(computeResults(profile({ maturityLevel: 'developing' }))).toBeNull();
  });

  it('returns null with an industry but neither a maturity level nor ratings', () => {
    expect(computeResults(profile({ industry: 'retail' }))).toBeNull();
  });

  it.each([
    ['emerging', 13, 'emerging'],
    ['developing', 38, 'developing'],
    ['implementing', 63, 'implementing'],
    ['leading', 88, 'leading'],
  ] as const)('with only maturity "%s", every dimension scores %i (%s)', (maturity, score, level) => {
    const results = computeResults(
      profile({ industry: 'retail', maturityLevel: maturity as MaturityLevel })
    );
    expect(results).not.toBeNull();
    expect(results?.dimensionScores).toHaveLength(DIMENSIONS.length);
    for (const ds of results?.dimensionScores ?? []) expect(ds.score).toBe(score);
    expect(results?.overallScore).toBe(score);
    expect(results?.overallLevel).toBe(level);
  });

  it('uses star ratings instead of the maturity level once any are given', () => {
    const results = computeResults(
      profile({ industry: 'retail', maturityLevel: 'emerging', dimensionAnswers: answerAll(4) })
    );
    expect(results?.overallScore).toBe(100);
    expect(results?.overallLevel).toBe('leading');
  });

  it('weights strategy and implementation more heavily in the overall score', () => {
    const strongIn = (dims: string[]) =>
      Object.fromEntries(
        DIMENSION_QUESTIONS.map((q) => [q.id, dims.includes(q.dimension) ? 4 : 0])
      );
    const heavy = computeResults(
      profile({
        industry: 'retail',
        dimensionAnswers: strongIn(['strategy-leadership', 'implementation-value']),
      })
    );
    const light = computeResults(
      profile({
        industry: 'retail',
        dimensionAnswers: strongIn(['people-skills', 'governance-trust']),
      })
    );
    expect(heavy?.overallScore).toBeGreaterThan(light?.overallScore ?? 100);
  });

  it('caps and orders the recommendations', () => {
    const results = computeResults(profile({ industry: 'retail', maturityLevel: 'developing' }));
    expect(results?.quickWins.length).toBeLessThanOrEqual(4);
    expect(results?.nextSteps.length).toBeLessThanOrEqual(4);
    expect(results?.strategicActions.length).toBeLessThanOrEqual(3);
    expect(results?.topOpportunities.length).toBeLessThanOrEqual(3);

    const scores = results?.topOpportunities.map((r) => r.score) ?? [];
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const card of results?.quickWins ?? []) expect(card.category).toBe('quick-win');
  });

  it('only includes benchmarks for the chosen industry', () => {
    const results = computeResults(profile({ industry: 'retail', maturityLevel: 'developing' }));
    for (const b of results?.benchmarks ?? []) expect(b.industry).toBe('retail');
  });

  it('is deterministic for the same answers', () => {
    const p = profile({
      industry: 'trades',
      maturityLevel: 'implementing',
      painPoints: ['admin-overload'],
    });
    expect(computeResults(p)).toEqual(computeResults(p));
  });
});
