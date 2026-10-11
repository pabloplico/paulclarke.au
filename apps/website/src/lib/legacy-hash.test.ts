import { describe, expect, it } from 'vitest';
import { legacyHashToPath } from './legacy-hash';

describe('legacyHashToPath', () => {
  it.each([
    ['#assess', '/assessment'],
    ['#assess/results', '/assessment'],
    ['#posts', '/writing'],
    ['#posts/thinking-about-thinking', '/writing/thinking-about-thinking'],
    ['#posts/', '/writing'],
    ['#projects', '/projects'],
    ['#about', '/about'],
    ['#contact', '/contact'],
    ['#home', '/'],
    ['#services/training', '/'],
    ['#insights', '/'],
  ])('maps %s to %s', (hash, path) => {
    expect(legacyHashToPath(hash)).toBe(path);
  });

  it.each(['', '#', '#main', '#something-else'])('leaves %j alone', (hash) => {
    expect(legacyHashToPath(hash)).toBeNull();
  });
});
