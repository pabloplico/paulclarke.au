import {
  ChartBarIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  ScaleIcon,
  TableCellsIcon,
  TagIcon,
} from '@heroicons/vue/24/outline';
import type { Component } from 'vue';

export interface NavItem {
  /** Route name */
  name: 'skills' | 'add-job' | 'jobs' | 'analytics' | 'taxonomy' | 'help';
  label: string;
  icon: Component;
  /** Listed under "Advanced" */
  advanced?: boolean;
}

// The one list of section names: the sidebar, page titles, Help and "How it works"
// read it, so a renamed page is renamed everywhere. Order follows onboarding: your
// skills, then jobs, then trends. Find Jobs joins in J7.
export const NAV_ITEMS: NavItem[] = [
  { name: 'skills', label: 'My Skills & Gaps', icon: ScaleIcon },
  { name: 'add-job', label: 'Add Job', icon: PlusIcon },
  { name: 'jobs', label: 'Job Listings', icon: TableCellsIcon },
  { name: 'analytics', label: 'Analytics', icon: ChartBarIcon },
  { name: 'taxonomy', label: 'Taxonomy', icon: TagIcon, advanced: true },
  { name: 'help', label: 'Help', icon: QuestionMarkCircleIcon, advanced: true },
];

export const navLabel = (name: NavItem['name']) =>
  NAV_ITEMS.find((item) => item.name === name)?.label ?? '';
