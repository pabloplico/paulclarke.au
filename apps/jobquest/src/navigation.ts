import {
  ChartBarIcon,
  PlusIcon,
  ScaleIcon,
  TableCellsIcon,
  TagIcon,
} from '@heroicons/vue/24/outline';
import type { Component } from 'vue';

export interface NavItem {
  /** Route name */
  name: 'skills' | 'add-job' | 'jobs' | 'analytics' | 'taxonomy';
  label: string;
  icon: Component;
  /** Listed under "Advanced" */
  advanced?: boolean;
}

// The one list of section names: the sidebar, page titles and (from J4) the help
// pages read it. Order follows onboarding: your skills, then jobs, then trends.
// Find Jobs and Help join as they're built (IMPORT_PLAN J4, J7).
export const NAV_ITEMS: NavItem[] = [
  { name: 'skills', label: 'My Skills & Gaps', icon: ScaleIcon },
  { name: 'add-job', label: 'Add Job', icon: PlusIcon },
  { name: 'jobs', label: 'Job Listings', icon: TableCellsIcon },
  { name: 'analytics', label: 'Analytics', icon: ChartBarIcon },
  { name: 'taxonomy', label: 'Taxonomy', icon: TagIcon, advanced: true },
];

export const navLabel = (name: NavItem['name']) =>
  NAV_ITEMS.find((item) => item.name === name)?.label ?? '';
