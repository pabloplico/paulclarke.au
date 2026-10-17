<script setup lang="ts">
import { CheckCircleIcon, ExclamationCircleIcon, PlusIcon } from '@heroicons/vue/24/outline';
import { computed, ref, useId } from 'vue';
import { RouterLink } from 'vue-router';
import { fieldErrors, skillInputSchema } from '../../shared/forms';
import { PROFICIENCY_LABELS, type Proficiency, type UserSkill } from '../../shared/types';
import { ApiError } from '../api/client';
import FormField from '../components/FormField.vue';
import InlineDeleteConfirm from '../components/InlineDeleteConfirm.vue';
import { skillsResource, useJobs, useSkills } from '../composables/resources';
import { useSkillMatch } from '../composables/useSkillMatch';
import { useToast } from '../composables/useToast';
import { duplicateOf, TOP_GAPS } from '../lib/matching';

// The AI Skill Builder ("generate skills for a role") joins this page in J6.
const skills = useSkills();
const jobs = useJobs();
const { fit, taxonomy } = useSkillMatch();
const create = skillsResource.useCreate();
const update = skillsResource.useUpdate();
const remove = skillsResource.useRemove();
const { show } = useToast();
const headingId = useId();

const LEVELS = Object.entries(PROFICIENCY_LABELS).map(([value, label]) => ({
  value: Number(value) as Proficiency,
  label,
}));

const newName = ref('');
const newLevel = ref<Proficiency>(3);
const nameError = ref<string>();
const nameInput = ref<HTMLInputElement>();

function addSkill(name: string, proficiency: Proficiency = 3, fromForm = false) {
  const parsed = skillInputSchema.safeParse({ name, proficiency });
  if (!parsed.success) {
    nameError.value = fieldErrors(parsed.error).name;
    nameInput.value?.focus();
    return;
  }
  const existing = duplicateOf(parsed.data.name, skills.data.value ?? [], taxonomy.value);
  if (existing) {
    nameError.value = `You already have ${existing.name}.`;
    nameInput.value?.focus();
    return;
  }
  nameError.value = undefined;
  create.mutate(parsed.data, {
    onSuccess: (skill) => {
      if (fromForm) newName.value = '';
      show(`Added ${skill.name} to your skills.`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors.name && fromForm) {
        nameError.value = error.fieldErrors.name;
      } else {
        show(`Couldn't add ${parsed.data.name}: ${error.message}`, 'error');
      }
    },
  });
}

function setLevel(skill: UserSkill, proficiency: Proficiency) {
  update.mutate(
    { id: skill.id, changes: { proficiency } },
    { onError: (error) => show(`Couldn't change ${skill.name}: ${error.message}`, 'error') }
  );
}

function removeSkill(skill: UserSkill) {
  remove.mutate(skill.id, {
    onSuccess: () => show(`Removed ${skill.name} from your skills.`),
    onError: (error) => show(`Couldn't remove ${skill.name}: ${error.message}`, 'error'),
  });
}

const hasJobs = computed(() => (jobs.data.value?.length ?? 0) > 0);
const jobsLabel = (count: number) => (count === 1 ? '1 job' : `${count} jobs`);
</script>

<template>
  <section :aria-labelledby="headingId" class="space-y-8">
    <div>
      <h1 :id="headingId" tabindex="-1" class="text-2xl font-bold outline-none">My Skills &amp; Gaps</h1>
      <p class="mt-1 text-muted-foreground">
        Compare your skills with what the jobs you've saved ask for.
      </p>
    </div>

    <p v-if="skills.isError.value" role="alert" class="text-destructive">
      Couldn't load your skills: {{ skills.error.value?.message }}
    </p>

    <div class="grid gap-8 lg:grid-cols-3">
      <section aria-labelledby="my-skills-heading" class="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <h2 id="my-skills-heading" class="text-lg font-bold">My skills</h2>
        <form novalidate class="space-y-3" @submit.prevent="addSkill(newName, newLevel, true)">
          <FormField v-slot="field" label="Skill" :error="nameError">
            <input
              :id="field.id"
              ref="nameInput"
              v-model="newName"
              name="name"
              placeholder="For example, React"
              autocomplete="off"
              class="w-full rounded-lg border border-input bg-card px-3 py-2 aria-[invalid=true]:border-destructive"
              :aria-describedby="field.describedBy"
              :aria-invalid="field.invalid"
            />
          </FormField>
          <div class="flex items-end gap-3">
            <FormField v-slot="field" label="Level" class="flex-1">
              <select
                :id="field.id"
                v-model.number="newLevel"
                name="proficiency"
                class="w-full rounded-lg border border-input bg-card px-3 py-2"
              >
                <option v-for="level in LEVELS" :key="level.value" :value="level.value">
                  {{ level.label }}
                </option>
              </select>
            </FormField>
            <button
              type="submit"
              class="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-indigo-700"
              :disabled="create.isPending.value"
            >
              <PlusIcon class="size-4" />
              Add
            </button>
          </div>
        </form>

        <p v-if="skills.isPending.value" class="text-sm text-muted-foreground">Loading your skills…</p>
        <ul v-else-if="(skills.data.value?.length ?? 0) > 0" class="space-y-2" aria-label="Your skills">
          <li
            v-for="skill in skills.data.value"
            :key="skill.id"
            class="flex items-center gap-2 rounded-lg border border-indigo-200 bg-accent p-2"
          >
            <span class="flex-1 text-sm font-medium text-accent-foreground">{{ skill.name }}</span>
            <select
              class="rounded border border-input bg-card px-2 py-1 text-xs"
              :aria-label="`Level for ${skill.name}`"
              :value="skill.proficiency"
              @change="setLevel(skill, Number(($event.target as HTMLSelectElement).value) as Proficiency)"
            >
              <option v-for="level in LEVELS" :key="level.value" :value="level.value">
                {{ level.label }}
              </option>
            </select>
            <InlineDeleteConfirm
              :label="`Remove ${skill.name} from your skills`"
              confirm-text="Remove"
              @confirm="removeSkill(skill)"
            />
          </li>
        </ul>
        <p v-else class="text-sm text-muted-foreground">Add your current skills to start the analysis.</p>
      </section>

      <div class="grid gap-6 md:grid-cols-2 lg:col-span-2">
        <section aria-labelledby="matched-heading" class="rounded-xl border bg-card p-6 shadow-sm">
          <h2 id="matched-heading" class="mb-4 flex items-center gap-2 text-lg font-bold text-green-800">
            <CheckCircleIcon class="size-6" />
            Matched with the market
          </h2>
          <p v-if="!hasJobs" class="text-sm text-muted-foreground">
            Add jobs to see which of your skills the market wants.
          </p>
          <ul v-else-if="fit.matched.length > 0" class="space-y-2">
            <li
              v-for="item in fit.matched"
              :key="item.name"
              class="flex items-center justify-between gap-2 rounded bg-green-50 p-2"
            >
              <span class="text-sm font-semibold text-green-900 capitalize">{{ item.name }}</span>
              <span class="rounded bg-green-200 px-2 py-0.5 text-xs text-green-900">
                In {{ jobsLabel(item.count) }}
              </span>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">
            None of your skills appear in your saved jobs yet.
          </p>
        </section>

        <section aria-labelledby="gaps-heading" class="rounded-xl border bg-card p-6 shadow-sm">
          <h2 id="gaps-heading" class="mb-4 flex items-center gap-2 text-lg font-bold text-amber-800">
            <ExclamationCircleIcon class="size-6" />
            Your biggest gaps
          </h2>
          <template v-if="!hasJobs">
            <p class="text-sm text-muted-foreground">Add jobs to see which skills you're missing.</p>
            <RouterLink
              :to="{ name: 'add-job' }"
              class="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <PlusIcon class="size-4" />
              Add a job
            </RouterLink>
          </template>
          <template v-else-if="fit.gaps.length > 0">
            <ul class="space-y-2">
              <li
                v-for="item in fit.gaps"
                :key="item.name"
                class="flex items-center justify-between gap-2 rounded bg-amber-50 p-2"
              >
                <span class="text-sm font-semibold text-amber-950 capitalize">{{ item.name }}</span>
                <span class="flex items-center gap-2">
                  <span class="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-950">
                    In {{ jobsLabel(item.count) }}
                  </span>
                  <button
                    type="button"
                    class="rounded p-1 text-amber-800 hover:bg-amber-100"
                    :aria-label="`I have ${item.name}: add it to my skills`"
                    @click="addSkill(item.name)"
                  >
                    <PlusIcon class="size-4" />
                  </button>
                </span>
              </li>
            </ul>
            <p class="mt-4 text-xs text-muted-foreground">
              The {{ TOP_GAPS }} skills your saved jobs ask for most that you don't have yet.
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">
            You have every skill your saved jobs ask for.
          </p>
        </section>
      </div>
    </div>
  </section>
</template>
