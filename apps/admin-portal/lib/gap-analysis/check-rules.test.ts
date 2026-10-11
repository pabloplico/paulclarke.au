import { describe, expect, it } from 'vitest';
import type { CompletenessRule } from '@/lib/db/schema';
import { checkRules, type SectionInput } from './check-rules';

function makeSection(overrides: Partial<SectionInput> = {}): SectionInput {
  return {
    id: 1,
    title: 'Test Section',
    template: 'prose',
    completenessRules: null,
    ...overrides,
  };
}

// ── No rules (fallback checks) ──────────────────────────────────────────────

describe('checkRules – no explicit rules', () => {
  it('flags empty section with no content and no structured data as high', () => {
    const findings = checkRules(makeSection(), '', null);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      sectionId: 1,
      severity: 'high',
      issue: 'Section is empty',
    });
  });

  it('flags empty string content with empty structured data as high', () => {
    const findings = checkRules(makeSection(), '', { items: [] });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
  });

  it('flags very short content (< 50 chars) as medium', () => {
    const findings = checkRules(makeSection(), 'Brief notes.', null);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'medium',
      issue: 'Section has very little content',
    });
  });

  it('passes section with content >= 50 chars and no rules', () => {
    const content = 'A'.repeat(50);
    const findings = checkRules(makeSection(), content, null);
    expect(findings).toHaveLength(0);
  });

  it('passes empty content when structured data has items', () => {
    const findings = checkRules(makeSection(), '', { items: [{ name: 'item1' }] });
    expect(findings).toHaveLength(0);
  });

  it('passes empty content when structured data has rows', () => {
    const findings = checkRules(makeSection(), '', { rows: [{ col: 'val' }] });
    expect(findings).toHaveLength(0);
  });

  it('passes empty content when structured data has pairs', () => {
    const findings = checkRules(makeSection(), '', { pairs: [{ key: 'k', value: 'v' }] });
    expect(findings).toHaveLength(0);
  });

  it('does not flag short content when structured data has items', () => {
    // Short text + structured items → should pass (structured content counts)
    const findings = checkRules(makeSection(), 'Hi', { items: [{ x: 1 }] });
    expect(findings).toHaveLength(0);
  });
});

// ── min_length rule ─────────────────────────────────────────────────────────

describe('checkRules – min_length', () => {
  const rule: CompletenessRule = {
    type: 'min_length',
    description: 'Needs more detail',
    params: { minLength: 200 },
  };

  it('flags content shorter than minLength', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, 'Short.', null);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleType: 'min_length',
      suggestion: 'Needs more detail',
    });
  });

  it('assigns high severity when content < half of minLength', () => {
    const section = makeSection({ completenessRules: [rule] });
    // 50 chars is < 200/2 = 100
    const findings = checkRules(section, 'X'.repeat(50), null);
    expect(findings[0]?.severity).toBe('high');
  });

  it('assigns medium severity when content >= half but < minLength', () => {
    const section = makeSection({ completenessRules: [rule] });
    // 150 chars is >= 100 but < 200
    const findings = checkRules(section, 'X'.repeat(150), null);
    expect(findings[0]?.severity).toBe('medium');
  });

  it('passes when content meets minLength', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, 'X'.repeat(200), null);
    expect(findings).toHaveLength(0);
  });

  it('passes when content exceeds minLength', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, 'X'.repeat(500), null);
    expect(findings).toHaveLength(0);
  });

  it('uses default minLength of 200 when param is missing', () => {
    const ruleNoParam: CompletenessRule = {
      type: 'min_length',
      description: '',
      params: {},
    };
    const section = makeSection({ completenessRules: [ruleNoParam] });
    // 199 chars should fail
    const findings = checkRules(section, 'X'.repeat(199), null);
    expect(findings).toHaveLength(1);
    // 200 chars should pass
    const passFindings = checkRules(section, 'X'.repeat(200), null);
    expect(passFindings).toHaveLength(0);
  });

  it('uses rule description as suggestion, falls back to generated text', () => {
    const ruleNoDesc: CompletenessRule = {
      type: 'min_length',
      description: '',
      params: { minLength: 100 },
    };
    const section = makeSection({ completenessRules: [ruleNoDesc] });
    const findings = checkRules(section, 'Short', null);
    expect(findings[0]?.suggestion).toContain('100 characters');
  });

  it('does not run fallback empty-check when explicit rules exist', () => {
    const section = makeSection({ completenessRules: [rule] });
    // Empty content with min_length rule → only the min_length finding, not the "Section is empty" fallback
    const findings = checkRules(section, '', null);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleType).toBe('min_length');
  });
});

// ── required_headings rule ──────────────────────────────────────────────────

describe('checkRules – required_headings', () => {
  const rule: CompletenessRule = {
    type: 'required_headings',
    description: '',
    params: { headings: ['## Overview', '## Pricing', '## Contact'] },
  };

  it('flags all missing headings', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, 'Some random content', null);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.issue).toContain('## Overview');
    expect(findings[0]?.issue).toContain('## Pricing');
    expect(findings[0]?.issue).toContain('## Contact');
  });

  it('assigns high severity when more than half are missing', () => {
    const section = makeSection({ completenessRules: [rule] });
    // 3 headings required, 0 present → 3 missing > 1.5 → high
    const findings = checkRules(section, 'No headings at all', null);
    expect(findings[0]?.severity).toBe('high');
  });

  it('assigns medium severity when half or fewer are missing', () => {
    const section = makeSection({ completenessRules: [rule] });
    // 3 required, 2 present → 1 missing, 1 is not > 1.5 → medium
    const content = 'Intro\n## Overview\nDetails\n## Pricing\nInfo';
    const findings = checkRules(section, content, null);
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.issue).toContain('## Contact');
    expect(findings[0]?.issue).not.toContain('## Overview');
  });

  it('passes when all headings are present', () => {
    const section = makeSection({ completenessRules: [rule] });
    const content = '## Overview\nIntro\n## Pricing\nDetails\n## Contact\nInfo';
    const findings = checkRules(section, content, null);
    expect(findings).toHaveLength(0);
  });

  it('handles empty headings array', () => {
    const emptyRule: CompletenessRule = {
      type: 'required_headings',
      description: '',
      params: { headings: [] },
    };
    const section = makeSection({ completenessRules: [emptyRule] });
    const findings = checkRules(section, '', null);
    expect(findings).toHaveLength(0);
  });
});

// ── min_items rule ──────────────────────────────────────────────────────────

describe('checkRules – min_items', () => {
  const rule: CompletenessRule = {
    type: 'min_items',
    description: 'Add more checklist items',
    params: { minItems: 5 },
  };

  it('flags when structured data has fewer items than minimum', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, '', { items: [{ a: 1 }, { a: 2 }] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleType: 'min_items',
      severity: 'medium',
      issue: 'Only 2 items (minimum 5)',
      suggestion: 'Add more checklist items',
    });
  });

  it('assigns high severity when item count is 0', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, '', { items: [] });
    expect(findings[0]?.severity).toBe('high');
  });

  it('assigns high severity when structured data is null', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, '', null);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.issue).toBe('Only 0 items (minimum 5)');
  });

  it('counts rows when items key is not present', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, '', {
      rows: [{ r: 1 }, { r: 2 }, { r: 3 }, { r: 4 }, { r: 5 }],
    });
    expect(findings).toHaveLength(0);
  });

  it('counts pairs when items and rows are not present', () => {
    const section = makeSection({ completenessRules: [rule] });
    const findings = checkRules(section, '', {
      pairs: [{ k: 1 }, { k: 2 }, { k: 3 }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.issue).toBe('Only 3 items (minimum 5)');
  });

  it('passes when item count meets minimum', () => {
    const section = makeSection({ completenessRules: [rule] });
    const data = { items: Array.from({ length: 5 }, (_, i) => ({ id: i })) };
    const findings = checkRules(section, '', data);
    expect(findings).toHaveLength(0);
  });

  it('uses default minItems of 3 when param is missing', () => {
    const ruleNoParam: CompletenessRule = {
      type: 'min_items',
      description: '',
      params: {},
    };
    const section = makeSection({ completenessRules: [ruleNoParam] });
    const findings = checkRules(section, '', { items: [{ a: 1 }, { a: 2 }] });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.issue).toContain('minimum 3');
  });
});

// ── Multiple rules ──────────────────────────────────────────────────────────

describe('checkRules – multiple rules', () => {
  it('returns findings from all failing rules', () => {
    const rules: CompletenessRule[] = [
      { type: 'min_length', description: '', params: { minLength: 500 } },
      {
        type: 'required_headings',
        description: '',
        params: { headings: ['## Overview'] },
      },
    ];
    const section = makeSection({ completenessRules: rules });
    const findings = checkRules(section, 'Short content', null);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.ruleType)).toEqual(['min_length', 'required_headings']);
  });

  it('returns empty array when all rules pass', () => {
    const rules: CompletenessRule[] = [
      { type: 'min_length', description: '', params: { minLength: 10 } },
      {
        type: 'required_headings',
        description: '',
        params: { headings: ['## Overview'] },
      },
    ];
    const section = makeSection({ completenessRules: rules });
    const findings = checkRules(section, `## Overview\n${'A'.repeat(50)}`, null);
    expect(findings).toHaveLength(0);
  });
});

// ── Section metadata in findings ────────────────────────────────────────────

describe('checkRules – finding metadata', () => {
  it('includes correct sectionId and sectionTitle in findings', () => {
    const section = makeSection({ id: 42, title: 'My Procedures' });
    const findings = checkRules(section, '', null);
    expect(findings[0]).toMatchObject({
      sectionId: 42,
      sectionTitle: 'My Procedures',
    });
  });
});

// ── Stale dependencies ─────────────────────────────────────────────────────

describe('checkRules – stale dependencies', () => {
  it('flags section with stale dependencies as medium severity', () => {
    const section = makeSection({
      staleDependencies: [{ targetTitle: 'Market Research', relationType: 'summarizes' }],
    });
    const findings = checkRules(section, 'A'.repeat(100), null);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'medium',
      ruleType: 'stale_dependency',
    });
    expect(findings[0]?.issue).toContain('Market Research');
  });

  it('includes multiple stale dependency names', () => {
    const section = makeSection({
      staleDependencies: [
        { targetTitle: 'SWOT Analysis', relationType: 'derived_from' },
        { targetTitle: 'Competitor Analysis', relationType: 'references' },
      ],
    });
    const findings = checkRules(section, 'A'.repeat(100), null);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.issue).toContain('SWOT Analysis');
    expect(findings[0]?.issue).toContain('Competitor Analysis');
  });

  it('does not flag when staleDependencies is empty', () => {
    const section = makeSection({ staleDependencies: [] });
    const findings = checkRules(section, 'A'.repeat(100), null);
    expect(findings).toHaveLength(0);
  });

  it('does not flag when staleDependencies is undefined', () => {
    const section = makeSection();
    const findings = checkRules(section, 'A'.repeat(100), null);
    expect(findings).toHaveLength(0);
  });

  it('coexists with other rule findings', () => {
    const section = makeSection({
      completenessRules: [{ type: 'min_length', description: '', params: { minLength: 500 } }],
      staleDependencies: [{ targetTitle: 'Source Section', relationType: 'requires' }],
    });
    const findings = checkRules(section, 'Short', null);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.ruleType)).toContain('min_length');
    expect(findings.map((f) => f.ruleType)).toContain('stale_dependency');
  });
});

// ── Unknown/custom rule type ────────────────────────────────────────────────

describe('checkRules – unknown rule type', () => {
  it('ignores unrecognized rule types without errors', () => {
    const rules: CompletenessRule[] = [{ type: 'custom', description: 'Custom check', params: {} }];
    const section = makeSection({ completenessRules: rules });
    // Should not throw and should not produce findings (no handler for 'custom')
    const findings = checkRules(section, 'Some content', null);
    expect(findings).toHaveLength(0);
  });
});
