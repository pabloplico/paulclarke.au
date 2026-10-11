export interface StalenessInput {
  /** When the dependent section was last updated */
  sectionUpdatedAt: Date;
  /** When the target (upstream) section was last updated */
  dependsOnUpdatedAt: Date;
}

/**
 * A dependency is stale if the target section was updated
 * after the dependent section's last update.
 */
export function isDependencyStale(input: StalenessInput): boolean {
  return input.dependsOnUpdatedAt > input.sectionUpdatedAt;
}

export interface DependencyWithTimestamps {
  dependencyId: number;
  sectionUpdatedAt: Date;
  dependsOnUpdatedAt: Date;
}

export interface SectionStalenessResult {
  sectionId: number;
  staleDependencies: number[];
  totalDependencies: number;
  isStale: boolean;
}

/**
 * Given a section's dependencies with timestamps,
 * compute which ones are stale.
 */
export function computeSectionStaleness(
  sectionId: number,
  dependencies: DependencyWithTimestamps[]
): SectionStalenessResult {
  const staleDeps = dependencies.filter((d) =>
    isDependencyStale({
      sectionUpdatedAt: d.sectionUpdatedAt,
      dependsOnUpdatedAt: d.dependsOnUpdatedAt,
    })
  );
  return {
    sectionId,
    staleDependencies: staleDeps.map((d) => d.dependencyId),
    totalDependencies: dependencies.length,
    isStale: staleDeps.length > 0,
  };
}
