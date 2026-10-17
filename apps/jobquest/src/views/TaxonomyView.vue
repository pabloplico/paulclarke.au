<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { computed, reactive, ref, useId } from 'vue';
import { countSkillDemand, getSkillGroups } from '../../shared/skillMatcher';
import type { Taxonomy } from '../../shared/types';
import FormField from '../components/FormField.vue';
import InlineDeleteConfirm from '../components/InlineDeleteConfirm.vue';
import { useJobs, useSaveTaxonomy, useSkills, useTaxonomy } from '../composables/resources';
import { useToast } from '../composables/useToast';
import {
  addGroup,
  addToGroup,
  allGroups,
  countAs,
  mergesByCanonical,
  removeFromGroup,
  removeGroup,
  skillsInGroup,
  stopCountingAs,
} from '../lib/taxonomy';

// The React version's board was drag-and-drop only. Here every change is a button
// or a form, so it works from the keyboard and with a screen reader. The AI's
// "generate a taxonomy" joins this page in J6.
const taxonomyQuery = useTaxonomy();
const jobs = useJobs();
const skills = useSkills();
const save = useSaveTaxonomy();
const { show } = useToast();
const headingId = useId();
const datalistId = useId();

const taxonomy = computed(() => taxonomyQuery.data.value);
const demand = computed(() =>
  taxonomy.value ? countSkillDemand(jobs.data.value ?? [], taxonomy.value) : []
);

function apply(next: Taxonomy, message: string) {
  save.mutate(next, {
    onSuccess: () => show(message),
    onError: (error) => show(`Couldn't save the taxonomy: ${error.message}`, 'error'),
  });
}

// Names to suggest in the merge form: from the jobs, your skills and existing merges
const suggestions = computed(() => {
  const names = new Set(demand.value.map((item) => item.name));
  for (const skill of skills.data.value ?? []) names.add(skill.name.toLowerCase());
  for (const canonical of Object.values(taxonomy.value?.canonicalMap ?? {})) names.add(canonical);
  return [...names].sort();
});

const merge = reactive({ from: '', to: '' });
const mergeError = ref<string>();
function submitMerge() {
  if (!taxonomy.value) return;
  const edit = countAs(taxonomy.value, merge.from, merge.to);
  if ('error' in edit) {
    mergeError.value = edit.error;
    return;
  }
  mergeError.value = undefined;
  const from = merge.from.trim().toLowerCase();
  apply(edit.taxonomy, `${from} now counts as ${edit.taxonomy.canonicalMap[from]}.`);
  merge.from = '';
  merge.to = '';
}

const merges = computed(() => (taxonomy.value ? mergesByCanonical(taxonomy.value) : []));
const groups = computed(() => (taxonomy.value ? allGroups(taxonomy.value) : []));
const ungrouped = computed(() =>
  taxonomy.value
    ? demand.value.filter((item) => getSkillGroups(item.name, taxonomy.value as Taxonomy).length === 0)
    : []
);
const chosenGroup = reactive<Record<string, string>>({});
function group(skill: string) {
  const groupId = chosenGroup[skill];
  const target = groups.value.find((candidate) => candidate.id === groupId);
  if (!taxonomy.value || !target) return;
  apply(addToGroup(taxonomy.value, skill, target.id), `Added ${skill} to ${target.name}.`);
}

const GROUP_COLOURS = [
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Amber', value: '#b45309' },
  { name: 'Rose', value: '#be123c' },
  { name: 'Green', value: '#15803d' },
  { name: 'Slate', value: '#475569' },
];
const newGroup = reactive({ name: '', color: GROUP_COLOURS[0]?.value ?? '#4f46e5' });
const groupError = ref<string>();
function submitGroup() {
  if (!taxonomy.value) return;
  const edit = addGroup(taxonomy.value, newGroup.name, newGroup.color);
  if ('error' in edit) {
    groupError.value = edit.error;
    return;
  }
  groupError.value = undefined;
  apply(edit.taxonomy, `Added the group ${newGroup.name.trim()}.`);
  newGroup.name = '';
}

const inputClass =
  'w-full rounded-lg border border-input bg-card px-3 py-2 aria-[invalid=true]:border-destructive';
</script>

<template>
  <section :aria-labelledby="headingId" class="space-y-8">
    <div>
      <h1 :id="headingId" tabindex="-1" class="text-2xl font-bold outline-none">Taxonomy</h1>
      <p class="mt-1 max-w-3xl text-muted-foreground">
        Decide which skill names count as the same skill, and sort skills into groups. Merges change
        your counts in Analytics, your match on each job and your skill gaps.
      </p>
    </div>

    <p v-if="taxonomyQuery.isPending.value" class="text-muted-foreground">Loading your taxonomy…</p>
    <p v-else-if="taxonomyQuery.isError.value" role="alert" class="text-destructive">
      Couldn't load your taxonomy: {{ taxonomyQuery.error.value?.message }}
    </p>

    <template v-else>
      <datalist :id="datalistId">
        <option v-for="name in suggestions" :key="name" :value="name" />
      </datalist>

      <section aria-labelledby="merges-heading" class="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h2 id="merges-heading" class="text-lg font-bold">Merged skills</h2>
          <p class="text-sm text-muted-foreground">
            Count one name as another: a synonym ("ReactJS" as "React") or a new name for a skill.
          </p>
        </div>
        <form novalidate class="flex flex-wrap items-end gap-3" @submit.prevent="submitMerge">
          <FormField v-slot="field" label="Count this skill" class="min-w-48 flex-1" :error="mergeError">
            <input
              :id="field.id"
              v-model="merge.from"
              name="from"
              autocomplete="off"
              :list="datalistId"
              :class="inputClass"
              :aria-describedby="field.describedBy"
              :aria-invalid="field.invalid"
            />
          </FormField>
          <FormField v-slot="field" label="as" class="min-w-48 flex-1">
            <input
              :id="field.id"
              v-model="merge.to"
              name="to"
              autocomplete="off"
              :list="datalistId"
              :class="inputClass"
            />
          </FormField>
          <button
            type="submit"
            class="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-indigo-700"
          >
            Merge
          </button>
        </form>

        <ul v-if="merges.length > 0" class="divide-y" aria-label="Merged skills">
          <li v-for="entry in merges" :key="entry.canonical" class="flex flex-wrap items-center gap-2 py-2">
            <span class="w-48 shrink-0 font-semibold capitalize">{{ entry.canonical }}</span>
            <span class="text-sm text-muted-foreground">also counts</span>
            <span
              v-for="synonym in entry.synonyms"
              :key="synonym"
              class="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-sm"
            >
              {{ synonym }}
              <button
                type="button"
                class="rounded-full text-muted-foreground hover:text-foreground"
                :aria-label="`Stop counting ${synonym} as ${entry.canonical}`"
                @click="apply(stopCountingAs(taxonomy as Taxonomy, synonym), `${synonym} counts as itself again.`)"
              >
                <XMarkIcon class="size-4" />
              </button>
            </span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">No merged skills yet.</p>
      </section>

      <section aria-labelledby="groups-heading" class="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h2 id="groups-heading" class="text-lg font-bold">Skill groups</h2>
          <p class="text-sm text-muted-foreground">
            Group the skills your jobs ask for. A skill can be in more than one group.
          </p>
        </div>

        <section aria-labelledby="ungrouped-heading" class="space-y-2">
          <h3 id="ungrouped-heading" class="font-semibold">
            Ungrouped skills in your jobs ({{ ungrouped.length }})
          </h3>
          <ul v-if="ungrouped.length > 0" class="max-h-96 divide-y overflow-y-auto rounded-lg border">
            <li v-for="item in ungrouped" :key="item.name" class="flex flex-wrap items-center gap-2 px-3 py-2">
              <span class="flex-1 font-medium capitalize">{{ item.name }}</span>
              <span class="text-xs text-muted-foreground">in {{ item.count === 1 ? '1 job' : `${item.count} jobs` }}</span>
              <select
                v-model="chosenGroup[item.name]"
                class="rounded border border-input bg-card px-2 py-1 text-sm"
                :aria-label="`Group for ${item.name}`"
              >
                <option value="" disabled>Choose a group</option>
                <option v-for="option in groups" :key="option.id" :value="option.id">{{ option.name }}</option>
              </select>
              <button
                type="button"
                class="rounded-lg px-3 py-1 text-sm font-semibold text-primary hover:bg-accent"
                :aria-label="`Add ${item.name} to the group`"
                @click="group(item.name)"
              >
                Add
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">Every skill in your jobs is in a group.</p>
        </section>

        <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Groups">
          <li
            v-for="option in groups"
            :key="option.id"
            class="rounded-lg border border-l-4 bg-card p-3"
            :style="{ borderLeftColor: option.color }"
          >
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-semibold">
                {{ option.name }}
                <span class="text-xs font-normal text-muted-foreground">
                  ({{ skillsInGroup(taxonomy as Taxonomy, option.id).length }})
                </span>
              </h3>
              <InlineDeleteConfirm
                :label="`Delete the group ${option.name}`"
                @confirm="apply(removeGroup(taxonomy as Taxonomy, option.id), `Deleted the group ${option.name}.`)"
              />
            </div>
            <ul class="mt-2 flex flex-wrap gap-1.5" :aria-label="`Skills in ${option.name}`">
              <li
                v-for="skill in skillsInGroup(taxonomy as Taxonomy, option.id)"
                :key="skill"
                class="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs"
              >
                {{ skill }}
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground"
                  :aria-label="`Take ${skill} out of ${option.name}`"
                  @click="apply(removeFromGroup(taxonomy as Taxonomy, skill, option.id), `Took ${skill} out of ${option.name}.`)"
                >
                  <XMarkIcon class="size-3.5" />
                </button>
              </li>
            </ul>
          </li>
        </ul>

        <form novalidate class="flex flex-wrap items-end gap-3 border-t pt-4" @submit.prevent="submitGroup">
          <FormField v-slot="field" label="New group" class="min-w-48 flex-1" :error="groupError">
            <input
              :id="field.id"
              v-model="newGroup.name"
              name="groupName"
              autocomplete="off"
              :class="inputClass"
              :aria-describedby="field.describedBy"
              :aria-invalid="field.invalid"
            />
          </FormField>
          <FormField v-slot="field" label="Colour">
            <select :id="field.id" v-model="newGroup.color" name="groupColour" :class="inputClass">
              <option v-for="colour in GROUP_COLOURS" :key="colour.value" :value="colour.value">
                {{ colour.name }}
              </option>
            </select>
          </FormField>
          <button
            type="submit"
            class="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-indigo-700"
          >
            Add group
          </button>
        </form>
      </section>
    </template>
  </section>
</template>
