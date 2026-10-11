import { describe, expect, it } from 'vitest';
import { MAX_SECTION_DEPTH, validateDepth } from './section-tree';

// getMaxDescendantDepth is not exported, but we test it indirectly through validateDepth.
// We also re-implement a minimal version for direct testing.
// Since getMaxDescendantDepth is private, we test its behavior through validateDepth.

type Section = { id: number; parentSectionId: number | null };

/** Build a linear chain of `length` sections with ids `startId..`; the first is a root. */
function chain(length: number, startId = 1): Section[] {
  return Array.from({ length }, (_, i) => ({
    id: startId + i,
    parentSectionId: i === 0 ? null : startId + i - 1,
  }));
}

describe('validateDepth', () => {
  it('allows root-level placement (parentSectionId = null)', () => {
    const result = validateDepth(null, []);
    expect(result).toEqual({ valid: true });
  });

  it('allows valid single-level nesting', () => {
    const sections: Section[] = [{ id: 1, parentSectionId: null }];
    const result = validateDepth(1, sections);
    expect(result).toEqual({ valid: true });
  });

  it('allows valid two-level nesting', () => {
    const sections: Section[] = [
      { id: 1, parentSectionId: null },
      { id: 2, parentSectionId: 1 },
    ];
    const result = validateDepth(2, sections);
    expect(result).toEqual({ valid: true });
  });

  it('allows nesting at exactly MAX_SECTION_DEPTH', () => {
    // Deepest section in the chain sits at depth MAX_SECTION_DEPTH - 1, so its child is at the limit
    const sections = chain(MAX_SECTION_DEPTH);
    const result = validateDepth(MAX_SECTION_DEPTH, sections);
    expect(result).toEqual({ valid: true });
  });

  it('rejects nesting that exceeds MAX_SECTION_DEPTH', () => {
    // Deepest section sits at depth MAX_SECTION_DEPTH, so a child would be one level too deep
    const sections = chain(MAX_SECTION_DEPTH + 1);
    const result = validateDepth(MAX_SECTION_DEPTH + 1, sections);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${MAX_SECTION_DEPTH + 1} levels`);
  });

  it('rejects cycle when moving section under its own descendant', () => {
    const sections: Section[] = [
      { id: 1, parentSectionId: null },
      { id: 2, parentSectionId: 1 },
    ];
    const result = validateDepth(2, sections, 1);
    expect(result).toEqual({
      valid: false,
      error: 'Cannot move a section under its own descendant',
    });
  });

  it('rejects exceeding depth when moving subtree with descendants', () => {
    // Target parent is the end of a chain, so parentDepth = MAX_SECTION_DEPTH.
    // The moved subtree (root -> child) adds 1 more level, exceeding the limit.
    const target = chain(MAX_SECTION_DEPTH);
    const subtree = chain(2, 100);
    const result = validateDepth(MAX_SECTION_DEPTH, [...target, ...subtree], 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${MAX_SECTION_DEPTH + 1} levels`);
  });

  it('allows moving a leaf section to a valid parent', () => {
    const sections: Section[] = [
      { id: 1, parentSectionId: null },
      { id: 2, parentSectionId: null },
    ];
    const result = validateDepth(1, sections, 2);
    expect(result).toEqual({ valid: true });
  });

  it('handles branching tree — deepest branch determines depth', () => {
    // Subtree: 1 -> 2 (shallow branch), 1 -> 3 -> 4 (deep branch), so subtreeDepth = 2.
    // Target parent at the end of a chain gives parentDepth = MAX_SECTION_DEPTH - 1.
    const subtree: Section[] = [
      { id: 1, parentSectionId: null },
      { id: 2, parentSectionId: 1 },
      { id: 3, parentSectionId: 1 },
      { id: 4, parentSectionId: 3 },
    ];
    const target = chain(MAX_SECTION_DEPTH - 1, 100);
    const targetId = 100 + MAX_SECTION_DEPTH - 2;

    // Deep branch pushes the total to MAX_SECTION_DEPTH + 1
    expect(validateDepth(targetId, [...subtree, ...target], 1).valid).toBe(false);

    // Without the deep leaf, the shallow branch alone fits exactly
    const shallowOnly = subtree.filter((s) => s.id !== 4);
    expect(validateDepth(targetId, [...shallowOnly, ...target], 1)).toEqual({ valid: true });
  });

  it('handles empty sections array with non-null parent', () => {
    // parentSectionId=99 doesn't exist in array, getParentDepth returns 1 (depth of 99 = 0 + 1)
    const result = validateDepth(99, []);
    // getDepth on id 99 with empty array returns 0, so parentDepth = 0 + 1 = 1
    // subtreeDepth = 0, total = 1 <= MAX_SECTION_DEPTH, valid
    expect(result).toEqual({ valid: true });
  });

  it('handles large section list without stack overflow', () => {
    // Build a flat list of 200 sections (all root-level)
    const sections: Section[] = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      parentSectionId: null,
    }));
    const result = validateDepth(1, sections);
    expect(result).toEqual({ valid: true });
  });

  it('handles large chain — deeply nested', () => {
    // Build a chain: 1 -> 2 -> 3 -> ... -> 50
    const sections: Section[] = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      parentSectionId: i === 0 ? null : i,
    }));
    // Try to place under section 50 (depth = 49 + 1 = 50, way exceeds MAX_SECTION_DEPTH)
    const result = validateDepth(50, sections);
    expect(result.valid).toBe(false);
  });
});

describe('MAX_SECTION_DEPTH', () => {
  it('is set to 4 (five levels: root plus four nested)', () => {
    expect(MAX_SECTION_DEPTH).toBe(4);
  });
});
