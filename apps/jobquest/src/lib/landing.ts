// Where `/` sends the visitor: the first unfinished onboarding step, as the old
// app did after loading. The old rule went on to Find Jobs (no jobs) and
// Analytics (both); those views come later (IMPORT_PLAN J7 and J3), which add
// their steps here. It never returns 'home', so the guard can't loop.
export type LandingRoute = 'skills' | 'jobs';

export function landingRoute({
  skillCount,
}: {
  skillCount: number;
  jobCount: number;
}): LandingRoute {
  if (skillCount === 0) return 'skills';
  return 'jobs';
}
