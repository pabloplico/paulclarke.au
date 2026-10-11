import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  determineFidelityStatus,
  FIDELITY_THRESHOLDS,
} from './semantic-fidelity';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [0.1, 0.2, 0.3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
  });

  it('computes correct similarity for known vectors', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // Expected: (4+10+18) / (sqrt(14) * sqrt(77)) ≈ 0.9746
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0.97);
    expect(result).toBeLessThan(0.98);
  });
});

describe('determineFidelityStatus', () => {
  it('returns passed when similarity >= passThreshold', () => {
    expect(determineFidelityStatus(0.8, 'rewrite')).toBe('passed');
    expect(determineFidelityStatus(0.78, 'rewrite')).toBe('passed');
  });

  it('returns flagged when between thresholds', () => {
    expect(determineFidelityStatus(0.65, 'rewrite')).toBe('flagged');
    expect(determineFidelityStatus(0.6, 'rewrite')).toBe('flagged');
  });

  it('returns rejected when below flagThreshold', () => {
    expect(determineFidelityStatus(0.5, 'rewrite')).toBe('rejected');
    expect(determineFidelityStatus(0.3, 'rewrite')).toBe('rejected');
  });

  it('uses lower thresholds for expand action', () => {
    // expand passThreshold is 0.55
    expect(determineFidelityStatus(0.6, 'expand')).toBe('passed');
    expect(determineFidelityStatus(0.45, 'expand')).toBe('flagged');
    expect(determineFidelityStatus(0.3, 'expand')).toBe('rejected');
  });

  it('uses custom thresholds for unknown operations', () => {
    // Falls back to custom: pass=0.60, flag=0.40
    expect(determineFidelityStatus(0.65, 'unknown_op')).toBe('passed');
    expect(determineFidelityStatus(0.5, 'unknown_op')).toBe('flagged');
    expect(determineFidelityStatus(0.3, 'unknown_op')).toBe('rejected');
  });

  // ── GAP-016: Exact boundary threshold tests ───────────────────────────────

  it('TC-016-A1: rewrite — exactly at passThreshold (0.78) → passed', () => {
    expect(determineFidelityStatus(0.78, 'rewrite')).toBe('passed');
  });

  it('TC-016-A2: rewrite — one epsilon below passThreshold → flagged', () => {
    expect(determineFidelityStatus(0.7799, 'rewrite')).toBe('flagged');
  });

  it('TC-016-A3: rewrite — exactly at flagThreshold (0.60) → flagged', () => {
    expect(determineFidelityStatus(0.6, 'rewrite')).toBe('flagged');
  });

  it('TC-016-A4: rewrite — one epsilon below flagThreshold → rejected', () => {
    expect(determineFidelityStatus(0.5999, 'rewrite')).toBe('rejected');
  });

  it('TC-016-B1: simplify — exactly at passThreshold (0.75) → passed', () => {
    expect(determineFidelityStatus(0.75, 'simplify')).toBe('passed');
  });

  it('TC-016-B2: simplify — exactly at flagThreshold (0.55) → flagged', () => {
    expect(determineFidelityStatus(0.55, 'simplify')).toBe('flagged');
  });

  it('TC-016-B3: simplify — below flagThreshold → rejected', () => {
    expect(determineFidelityStatus(0.5499, 'simplify')).toBe('rejected');
  });

  it('TC-016-C1: expand — exactly at passThreshold (0.55) → passed', () => {
    expect(determineFidelityStatus(0.55, 'expand')).toBe('passed');
  });

  it('TC-016-C2: expand — exactly at flagThreshold (0.35) → flagged', () => {
    expect(determineFidelityStatus(0.35, 'expand')).toBe('flagged');
  });

  it('TC-016-C3: expand — below flagThreshold → rejected', () => {
    expect(determineFidelityStatus(0.3499, 'expand')).toBe('rejected');
  });

  it('TC-016-D1: research — exactly at passThreshold (0.50) → passed', () => {
    expect(determineFidelityStatus(0.5, 'research')).toBe('passed');
  });

  it('TC-016-D2: research — exactly at flagThreshold (0.30) → flagged', () => {
    expect(determineFidelityStatus(0.3, 'research')).toBe('flagged');
  });

  it('TC-016-D3: research — below flagThreshold → rejected', () => {
    expect(determineFidelityStatus(0.2999, 'research')).toBe('rejected');
  });

  it('TC-016-E1: gap_fix — passThreshold boundary (same as research: 0.50)', () => {
    expect(determineFidelityStatus(0.5, 'gap_fix')).toBe('passed');
    expect(determineFidelityStatus(0.4999, 'gap_fix')).toBe('flagged');
  });

  it('TC-016-F1: unknown operationType falls back to custom thresholds (pass=0.60)', () => {
    expect(determineFidelityStatus(0.6, 'made_up_op')).toBe('passed');
    expect(determineFidelityStatus(0.5999, 'made_up_op')).toBe('flagged');
    expect(determineFidelityStatus(0.3999, 'made_up_op')).toBe('rejected');
  });

  it('TC-016-G1: similarity of exactly 0.0 is always rejected for all operation types', () => {
    for (const key of Object.keys(FIDELITY_THRESHOLDS)) {
      expect(determineFidelityStatus(0.0, key)).toBe('rejected');
    }
  });

  it('TC-016-G2: similarity of exactly 1.0 is always passed for all operation types', () => {
    for (const key of Object.keys(FIDELITY_THRESHOLDS)) {
      expect(determineFidelityStatus(1.0, key)).toBe('passed');
    }
  });
});
