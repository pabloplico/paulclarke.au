import type { CurationStatus } from '@/lib/types';

export const CURATION_CONFIG: Record<CurationStatus, { label: string; className: string }> = {
  raw: { label: 'Raw', className: 'bg-white/10 text-white/60 border-white/20' },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  excluded: { label: 'Excluded', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  parked: { label: 'Parked', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

export type CurationFilter = 'all' | CurationStatus;

export function matchesCurationFilter(status: string, filter: CurationFilter): boolean {
  if (filter === 'all') return true;
  return status === filter;
}
