import { describe, expect, it } from 'vitest';
import {
  computeSectionStaleness,
  type DependencyWithTimestamps,
  isDependencyStale,
} from './staleness';

// ── isDependencyStale ──────────────────────────────────────────────────────

describe('isDependencyStale', () => {
  it('returns true when target was updated after the dependent section', () => {
    expect(
      isDependencyStale({
        sectionUpdatedAt: new Date('2026-01-01'),
        dependsOnUpdatedAt: new Date('2026-01-02'),
      })
    ).toBe(true);
  });

  it('returns false when target was updated before the dependent section', () => {
    expect(
      isDependencyStale({
        sectionUpdatedAt: new Date('2026-01-02'),
        dependsOnUpdatedAt: new Date('2026-01-01'),
      })
    ).toBe(false);
  });

  it('returns false when both were updated at the same time', () => {
    const same = new Date('2026-01-01T12:00:00Z');
    expect(
      isDependencyStale({
        sectionUpdatedAt: same,
        dependsOnUpdatedAt: same,
      })
    ).toBe(false);
  });

  it('handles sub-second precision differences', () => {
    expect(
      isDependencyStale({
        sectionUpdatedAt: new Date('2026-01-01T12:00:00.000Z'),
        dependsOnUpdatedAt: new Date('2026-01-01T12:00:00.001Z'),
      })
    ).toBe(true);
  });
});

// ── computeSectionStaleness ────────────────────────────────────────────────

describe('computeSectionStaleness', () => {
  it('returns not stale for empty dependencies', () => {
    const result = computeSectionStaleness(1, []);
    expect(result).toEqual({
      sectionId: 1,
      staleDependencies: [],
      totalDependencies: 0,
      isStale: false,
    });
  });

  it('identifies stale dependencies', () => {
    const deps: DependencyWithTimestamps[] = [
      {
        dependencyId: 10,
        sectionUpdatedAt: new Date('2026-01-01'),
        dependsOnUpdatedAt: new Date('2026-01-05'), // stale
      },
      {
        dependencyId: 20,
        sectionUpdatedAt: new Date('2026-01-10'),
        dependsOnUpdatedAt: new Date('2026-01-02'), // fresh
      },
    ];
    const result = computeSectionStaleness(5, deps);
    expect(result).toEqual({
      sectionId: 5,
      staleDependencies: [10],
      totalDependencies: 2,
      isStale: true,
    });
  });

  it('returns not stale when all dependencies are fresh', () => {
    const deps: DependencyWithTimestamps[] = [
      {
        dependencyId: 10,
        sectionUpdatedAt: new Date('2026-01-10'),
        dependsOnUpdatedAt: new Date('2026-01-01'),
      },
      {
        dependencyId: 20,
        sectionUpdatedAt: new Date('2026-01-10'),
        dependsOnUpdatedAt: new Date('2026-01-05'),
      },
    ];
    const result = computeSectionStaleness(3, deps);
    expect(result.isStale).toBe(false);
    expect(result.staleDependencies).toEqual([]);
    expect(result.totalDependencies).toBe(2);
  });

  it('marks all as stale when all are outdated', () => {
    const deps: DependencyWithTimestamps[] = [
      {
        dependencyId: 1,
        sectionUpdatedAt: new Date('2026-01-01'),
        dependsOnUpdatedAt: new Date('2026-02-01'),
      },
      {
        dependencyId: 2,
        sectionUpdatedAt: new Date('2026-01-01'),
        dependsOnUpdatedAt: new Date('2026-03-01'),
      },
    ];
    const result = computeSectionStaleness(7, deps);
    expect(result.staleDependencies).toEqual([1, 2]);
    expect(result.isStale).toBe(true);
  });
});
