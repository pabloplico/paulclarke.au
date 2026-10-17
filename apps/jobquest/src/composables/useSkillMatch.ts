import { computed } from 'vue';
import type { SkillTaxonomy } from '../../shared/skillMatcher';
import type { Job } from '../../shared/types';
import { marketFit, matchJob } from '../lib/matching';
import { useJobs, useSkills, useTaxonomy } from './resources';

const NO_TAXONOMY: SkillTaxonomy = { canonicalMap: {}, skillGroups: {} };

/**
 * The visitor's skills against their jobs, recomputed when jobs, skills or the
 * taxonomy change. Replaces the React app's module-level taxonomy (and the
 * <App key> it needed): the profile's taxonomy is passed in.
 */
export function useSkillMatch() {
  const jobs = useJobs();
  const skills = useSkills();
  const taxonomy = useTaxonomy();

  const skillNames = computed(() => (skills.data.value ?? []).map((skill) => skill.name));
  const activeTaxonomy = computed(() => taxonomy.data.value ?? NO_TAXONOMY);

  return {
    skillNames,
    taxonomy: activeTaxonomy,
    isPending: computed(
      () => jobs.isPending.value || skills.isPending.value || taxonomy.isPending.value
    ),
    matchFor: (job: Pick<Job, 'skills' | 'software'>) =>
      matchJob(job, skillNames.value, activeTaxonomy.value),
    fit: computed(() => marketFit(jobs.data.value ?? [], skillNames.value, activeTaxonomy.value)),
  };
}
