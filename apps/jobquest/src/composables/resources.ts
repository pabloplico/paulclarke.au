import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
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

const TAXONOMY_KEY = ['taxonomy'] as const;

export function useTaxonomy() {
  return useQuery({ queryKey: TAXONOMY_KEY, queryFn: () => api<Taxonomy>('/taxonomy') });
}

/**
 * Saves the whole taxonomy. Edits apply at once and roll back if the server
 * refuses. They share one mutation scope, so they reach the server one at a time
 * and in order: each sends the whole document, and an older one arriving last
 * would undo a newer one.
 */
export function useSaveTaxonomy() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: 'taxonomy' },
    mutationFn: (taxonomy: Taxonomy) =>
      api<Taxonomy>('/taxonomy', { method: 'PUT', body: taxonomy }),
    onMutate: async (taxonomy) => {
      await queryClient.cancelQueries({ queryKey: TAXONOMY_KEY });
      const previous = queryClient.getQueryData<Taxonomy>(TAXONOMY_KEY);
      queryClient.setQueryData(TAXONOMY_KEY, taxonomy);
      return { previous };
    },
    onError: (_error, _taxonomy, context) =>
      queryClient.setQueryData(TAXONOMY_KEY, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TAXONOMY_KEY }),
  });
}
