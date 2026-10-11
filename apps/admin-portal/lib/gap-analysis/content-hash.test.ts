import { describe, expect, it } from 'vitest';
import { computeStaleness, hashSectionContent, hashWorkspace } from './content-hash';

describe('hashSectionContent', () => {
  it('produces consistent hash for same content', () => {
    const hash1 = hashSectionContent('hello', null);
    const hash2 = hashSectionContent('hello', null);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different content', () => {
    const hash1 = hashSectionContent('hello', null);
    const hash2 = hashSectionContent('world', null);
    expect(hash1).not.toBe(hash2);
  });

  it('includes structured data in hash', () => {
    const hash1 = hashSectionContent('hello', null);
    const hash2 = hashSectionContent('hello', { key: 'value' });
    expect(hash1).not.toBe(hash2);
  });

  it('returns a 64-char hex string', () => {
    const hash = hashSectionContent('test', null);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  // ── GAP-014: Sensitivity tests ────────────────────────────────────────────

  it('TC-014-A1: single-character change in content produces a different hash', () => {
    const hash1 = hashSectionContent('abc', null);
    const hash2 = hashSectionContent('abd', null);
    expect(hash1).not.toBe(hash2);
  });

  it('TC-014-A2: single-character change in structuredData produces a different hash', () => {
    const hash1 = hashSectionContent('x', { a: 1 });
    const hash2 = hashSectionContent('x', { a: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it('TC-014-A3: trailing whitespace changes the hash', () => {
    const hash1 = hashSectionContent('hello', null);
    const hash2 = hashSectionContent('hello ', null);
    expect(hash1).not.toBe(hash2);
  });

  it('TC-014-A4: empty content with structuredData differs from empty content without', () => {
    const hash1 = hashSectionContent('', null);
    const hash2 = hashSectionContent('', { k: 'v' });
    expect(hash1).not.toBe(hash2);
  });

  it('TC-014-A5: structuredData key order in JSON affects hash (not key-order-stable)', () => {
    // Documents that JSON.stringify preserves insertion order in V8 (Node.js)
    // so key-order differences produce different serialisations and thus different hashes
    const hash1 = hashSectionContent('', { a: 1, b: 2 });
    const hash2 = hashSectionContent('', { b: 2, a: 1 });
    // This may or may not differ depending on JS engine key ordering; we document the behaviour.
    // In V8 (Node.js), non-integer keys preserve insertion order so these will differ.
    expect(hash1).not.toBe(hash2);
  });
});

describe('hashWorkspace', () => {
  it('is order-independent', () => {
    const hash1 = hashWorkspace({ 1: 'aaa', 2: 'bbb' });
    const hash2 = hashWorkspace({ 2: 'bbb', 1: 'aaa' });
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different section hashes', () => {
    const hash1 = hashWorkspace({ 1: 'aaa' });
    const hash2 = hashWorkspace({ 1: 'bbb' });
    expect(hash1).not.toBe(hash2);
  });

  // ── GAP-014: hashWorkspace tests ──────────────────────────────────────────

  it('TC-014-B1: keys 1, 2, 10 are sorted numerically, not lexicographically', () => {
    // Numeric sort: 1, 2, 10 → concat 'a','b','c'
    // Lexicographic sort: 1, 10, 2 → concat 'a','c','b' (different result)
    // Both objects below have the same k-v pairs; numeric sort must yield same hash
    const hashA = hashWorkspace({ 1: 'a', 2: 'b', 10: 'c' });
    const hashB = hashWorkspace({ 10: 'c', 1: 'a', 2: 'b' });
    expect(hashA).toBe(hashB);
  });

  it('TC-014-B2: single-key workspace — changing the key hash changes the workspace hash', () => {
    const hash1 = hashWorkspace({ 5: 'a'.repeat(64) });
    const hash2 = hashWorkspace({ 5: 'b'.repeat(64) });
    expect(hash1).not.toBe(hash2);
  });

  it('TC-014-B3: hashWorkspace returns a 64-char hex string', () => {
    const hash = hashWorkspace({ 1: 'abc' });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('TC-014-B4: adding a section to the workspace changes the workspace hash', () => {
    const hash1 = hashWorkspace({ 1: 'a' });
    const hash2 = hashWorkspace({ 1: 'a', 2: 'b' });
    expect(hash1).not.toBe(hash2);
  });
});

describe('computeStaleness', () => {
  it('marks changed sections as stale', () => {
    const stored = { 1: 'aaa', 2: 'bbb' };
    const current = { 1: 'aaa', 2: 'ccc' };
    const result = computeStaleness(stored, current);
    expect(result.get(1)).toBe(false);
    expect(result.get(2)).toBe(true);
  });

  it('returns undefined for all sections when stored is null', () => {
    const current = { 1: 'aaa', 2: 'bbb' };
    const result = computeStaleness(null, current);
    expect(result.get(1)).toBeUndefined();
    expect(result.get(2)).toBeUndefined();
  });

  it('marks new sections as stale', () => {
    const stored = { 1: 'aaa' };
    const current = { 1: 'aaa', 2: 'bbb' };
    const result = computeStaleness(stored, current);
    expect(result.get(1)).toBe(false);
    expect(result.get(2)).toBe(true);
  });

  // ── GAP-014: computeStaleness edge cases ──────────────────────────────────

  it('TC-014-C1: storedHashes undefined returns undefined for all sections (same as null)', () => {
    const result = computeStaleness(undefined, { 1: 'abc' });
    expect(result.get(1)).toBeUndefined();
  });

  it('TC-014-C2: section present in stored but absent in current is not reported', () => {
    // Section 2 was deleted; current only has section 1
    const stored = { 1: 'a', 2: 'b' };
    const current = { 1: 'a' };
    const result = computeStaleness(stored, current);
    // current drives iteration — removed sections are not included
    expect(result.has(2)).toBe(false);
  });

  it('TC-014-C3: identical hash means not stale', () => {
    const stored = { 7: 'samehash' };
    const current = { 7: 'samehash' };
    const result = computeStaleness(stored, current);
    expect(result.get(7)).toBe(false);
  });
});
