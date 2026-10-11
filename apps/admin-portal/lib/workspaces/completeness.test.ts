import { describe, expect, it } from 'vitest';
import { computeSectionComplete, computeWorkspaceCompleteness } from './completeness';

describe('computeSectionComplete', () => {
  describe('with no rules (fallback)', () => {
    it('returns false for empty content and no structured data', () => {
      expect(computeSectionComplete(null, null, null)).toBe(false);
      expect(computeSectionComplete('', null, null)).toBe(false);
    });

    it('returns false for short content (<50 chars)', () => {
      expect(computeSectionComplete('Short text', null, null)).toBe(false);
    });

    it('returns true for content >= 50 chars', () => {
      const content = 'A'.repeat(50);
      expect(computeSectionComplete(content, null, null)).toBe(true);
    });

    it('returns true when structured data has items', () => {
      expect(computeSectionComplete('', { items: [{ title: 'a', body: 'b' }] }, null)).toBe(true);
    });

    it('returns true when structured data has rows', () => {
      expect(computeSectionComplete('', { rows: [{ name: 'test' }] }, null)).toBe(true);
    });

    it('returns true when structured data has pairs', () => {
      expect(computeSectionComplete('', { pairs: [{ key: 'k', value: 'v' }] }, null)).toBe(true);
    });

    it('returns false when structured data arrays are empty', () => {
      expect(computeSectionComplete('', { items: [] }, null)).toBe(false);
    });
  });

  describe('with min_length rule', () => {
    const rules = [
      { type: 'min_length' as const, description: 'Min 200 chars', params: { minLength: 200 } },
    ];

    it('returns false when content is shorter than minimum', () => {
      expect(computeSectionComplete('A'.repeat(199), null, rules)).toBe(false);
    });

    it('returns true when content meets minimum', () => {
      expect(computeSectionComplete('A'.repeat(200), null, rules)).toBe(true);
    });

    it('uses default of 200 when minLength param is missing', () => {
      const noParamRules = [{ type: 'min_length' as const, description: 'Default', params: {} }];
      expect(computeSectionComplete('A'.repeat(199), null, noParamRules)).toBe(false);
      expect(computeSectionComplete('A'.repeat(200), null, noParamRules)).toBe(true);
    });
  });

  describe('with required_headings rule', () => {
    const rules = [
      {
        type: 'required_headings' as const,
        description: 'Need overview and pricing',
        params: { headings: ['## Overview', '## Pricing'] },
      },
    ];

    it('returns false when headings are missing', () => {
      expect(computeSectionComplete('Some content', null, rules)).toBe(false);
    });

    it('returns false when only some headings present', () => {
      expect(computeSectionComplete('## Overview\nContent here', null, rules)).toBe(false);
    });

    it('returns true when all headings present', () => {
      expect(computeSectionComplete('## Overview\nContent\n## Pricing\nDetails', null, rules)).toBe(
        true
      );
    });
  });

  describe('with min_items rule', () => {
    const rules = [
      { type: 'min_items' as const, description: 'Need 3 items', params: { minItems: 3 } },
    ];

    it('returns false with no structured data', () => {
      expect(computeSectionComplete('', null, rules)).toBe(false);
    });

    it('returns false with fewer items than minimum', () => {
      expect(computeSectionComplete('', { items: [{ text: 'a' }, { text: 'b' }] }, rules)).toBe(
        false
      );
    });

    it('returns true when meeting minimum items', () => {
      expect(
        computeSectionComplete('', { items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }, rules)
      ).toBe(true);
    });

    it('works with rows', () => {
      expect(
        computeSectionComplete('', { rows: [{ a: '1' }, { a: '2' }, { a: '3' }] }, rules)
      ).toBe(true);
    });

    it('works with pairs', () => {
      expect(
        computeSectionComplete('', { pairs: [{ k: 'a' }, { k: 'b' }, { k: 'c' }] }, rules)
      ).toBe(true);
    });
  });

  describe('with multiple rules (AND logic)', () => {
    const rules = [
      { type: 'min_length' as const, description: '', params: { minLength: 100 } },
      {
        type: 'required_headings' as const,
        description: '',
        params: { headings: ['## Overview'] },
      },
    ];

    it('returns false when only one rule passes', () => {
      // Long enough but missing heading
      expect(computeSectionComplete('A'.repeat(100), null, rules)).toBe(false);
      // Has heading but too short
      expect(computeSectionComplete('## Overview\nShort', null, rules)).toBe(false);
    });

    it('returns true when all rules pass', () => {
      const content = `## Overview\n${'A'.repeat(100)}`;
      expect(computeSectionComplete(content, null, rules)).toBe(true);
    });
  });
});

describe('computeWorkspaceCompleteness', () => {
  it('returns 0 for empty sections array', () => {
    expect(computeWorkspaceCompleteness([])).toBe(0);
  });

  it('returns 0 when no sections pass', () => {
    const sections = [
      { content: null, structuredData: null, completenessRules: null },
      { content: '', structuredData: null, completenessRules: null },
    ];
    expect(computeWorkspaceCompleteness(sections)).toBe(0);
  });

  it('returns 100 when all sections pass', () => {
    const sections = [
      { content: 'A'.repeat(50), structuredData: null, completenessRules: null },
      { content: 'B'.repeat(50), structuredData: null, completenessRules: null },
    ];
    expect(computeWorkspaceCompleteness(sections)).toBe(100);
  });

  it('returns correct percentage for mixed pass/fail', () => {
    const sections = [
      { content: 'A'.repeat(50), structuredData: null, completenessRules: null }, // pass
      { content: '', structuredData: null, completenessRules: null }, // fail
      { content: 'B'.repeat(50), structuredData: null, completenessRules: null }, // pass
      { content: 'short', structuredData: null, completenessRules: null }, // fail
    ];
    expect(computeWorkspaceCompleteness(sections)).toBe(50);
  });

  it('rounds to nearest integer', () => {
    const sections = [
      { content: 'A'.repeat(50), structuredData: null, completenessRules: null }, // pass
      { content: '', structuredData: null, completenessRules: null }, // fail
      { content: '', structuredData: null, completenessRules: null }, // fail
    ];
    expect(computeWorkspaceCompleteness(sections)).toBe(33);
  });
});
