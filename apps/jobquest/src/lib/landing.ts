// Where `/` sends the visitor: the first unfinished onboarding step, as the old
// app did after loading. The old rule sent a visitor with no jobs to Find Jobs,
// which arrives in J7; until then they go to their job list. It never returns
// 'home', so the guard can't loop.
export type LandingRoute = 'skills' | 'jobs' | 'analytics';

export function landingRoute({
  skillCount,
  jobCount,
}: {
  skillCount: number;
  jobCount: number;
}): LandingRoute {
  if (skillCount === 0) return 'skills';
  if (jobCount === 0) return 'jobs';
  return 'analytics';
}
