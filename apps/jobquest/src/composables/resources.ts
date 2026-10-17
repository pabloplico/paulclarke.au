import { useQuery } from '@tanstack/vue-query';
import type { z } from 'zod';
import type { jobPatchSchema, skillPatchSchema } from '../../shared/forms';
import type { Job, Taxonomy, UserSkill } from '../../shared/types';
import { api } from '../api/client';
import { listResource } from './listResource';

/** Jobs, newest first (the server's order). Mutations take already-validated input. */
export const jobsResource = listResource<Job, Partial<Job>, z.output<typeof jobPatchSchema>>({
  key: ['jobs'],
  path: '/jobs',
  place: (job, list) => [job, ...list],
});

/** The visitor's skills, by name (the server's order). */
export const skillsResource = listResource<
  UserSkill,
  Pick<UserSkill, 'name' | 'proficiency'> & Partial<UserSkill>,
  z.output<typeof skillPatchSchema>
>({
  key: ['skills'],
  path: '/skills',
  place: (skill, list) => [...list, skill].sort((a, b) => a.name.localeCompare(b.name)),
});

export const useJobs = jobsResource.useList;
export const useSkills = skillsResource.useList;

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<{ email: string }>('/me') });
}

export function useTaxonomy() {
  return useQuery({ queryKey: ['taxonomy'], queryFn: () => api<Taxonomy>('/taxonomy') });
}
