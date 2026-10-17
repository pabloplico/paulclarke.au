<script setup lang="ts">
import {
  ArrowLeftIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  LinkIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { computed, useId, watchEffect } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { SENIORITY_LABELS } from '../../shared/types';
import { useJobs } from '../composables/resources';
import { useSkillMatch } from '../composables/useSkillMatch';
import { hasSkill } from '../lib/matching';

const props = defineProps<{ jobId: string }>();

const router = useRouter();
const jobs = useJobs();
const { matchFor, skillNames, taxonomy } = useSkillMatch();
const headingId = useId();

// The job comes from the cached list, which a deep link loads too
const job = computed(() => jobs.data.value?.find((candidate) => candidate.id === props.jobId));
const match = computed(() => (job.value ? matchFor(job.value) : null));
const has = (skill: string) => hasSkill(skill, skillNames.value, taxonomy.value);

watchEffect(() => {
  if (job.value) document.title = `${job.value.title} · JobQuest`;
});

// Back to the list as it was (search and filters included) when we came from it
function back() {
  const previous = router.options.history.state.back;
  if (typeof previous === 'string' && previous.startsWith('/jobs')) router.back();
  else void router.push({ name: 'jobs' });
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<template>
  <div class="space-y-6">
    <button
      type="button"
      class="inline-flex items-center gap-2 font-medium text-primary hover:underline"
      @click="back"
    >
      <ArrowLeftIcon class="size-5" />
      Back to job listings
    </button>

    <p v-if="jobs.isPending.value" class="text-muted-foreground">Loading the job…</p>
    <p v-else-if="jobs.isError.value" role="alert" class="text-destructive">
      Couldn't load the job: {{ jobs.error.value?.message }}
    </p>

    <section v-else-if="!job" class="space-y-3">
      <h1 tabindex="-1" class="text-2xl font-bold outline-none">Job not found</h1>
      <p class="text-muted-foreground">It may have been deleted.</p>
      <RouterLink :to="{ name: 'jobs' }" class="font-medium text-primary hover:underline">
        See your job listings
      </RouterLink>
    </section>

    <article v-else :aria-labelledby="headingId" class="space-y-6">
      <header class="flex flex-wrap items-start justify-between gap-6 rounded-2xl bg-primary p-6 text-primary-foreground shadow-lg md:p-8">
        <div class="min-w-0 flex-1 space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <h1 :id="headingId" tabindex="-1" class="text-3xl font-bold outline-none">{{ job.title }}</h1>
            <span class="rounded-full bg-indigo-900 px-3 py-1 text-sm font-semibold">
              {{ SENIORITY_LABELS[job.seniorityLevel] }}
            </span>
          </div>
          <p class="flex items-center gap-2 text-xl">
            <BuildingOfficeIcon class="size-5" />
            {{ job.company }}
          </p>
          <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li class="flex items-center gap-2">
              <CalendarIcon class="size-4" />
              Added {{ formatDate(job.dateAdded) }}
            </li>
            <li v-if="job.salaryRange" class="flex items-center gap-2">
              <CurrencyDollarIcon class="size-4" />
              {{ job.salaryRange }}
            </li>
            <li v-if="job.url">
              <a
                :href="job.url"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 underline"
              >
                <LinkIcon class="size-4" />
                View the original posting<span class="sr-only"> (new tab)</span>
              </a>
            </li>
          </ul>
        </div>

        <div class="rounded-xl bg-white/15 p-4 text-center" aria-live="polite">
          <template v-if="match?.percentage != null">
            <p class="text-4xl font-bold">{{ match.percentage }}%</p>
            <p class="text-sm">skill match</p>
            <p class="text-xs">
              {{ match.matched.length }} of {{ job.skills.length + job.software.length }} skills
            </p>
          </template>
          <p v-else-if="job.skills.length + job.software.length === 0" class="max-w-40 text-sm">
            No skills listed for this job
          </p>
          <p v-else class="max-w-40 text-sm">
            Add your skills in
            <RouterLink :to="{ name: 'skills' }" class="font-semibold underline">My Skills &amp; Gaps</RouterLink>
            to see your match
          </p>
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-6">
          <section class="rounded-xl border bg-card p-6 shadow-sm">
            <h2 class="mb-4 text-xl font-bold">Required skills</h2>
            <ul v-if="job.skills.length > 0" class="flex flex-wrap gap-2">
              <li
                v-for="skill in job.skills"
                :key="skill"
                class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
                :class="has(skill) ? 'border-green-300 bg-green-50 text-green-900' : 'bg-muted'"
              >
                <CheckCircleIcon v-if="has(skill)" class="size-4 text-green-700" />
                <XCircleIcon v-else class="size-4 text-muted-foreground" />
                {{ skill }}
                <span class="sr-only">{{ has(skill) ? '(you have this)' : '(you don’t have this yet)' }}</span>
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">No skills listed.</p>
          </section>

          <section class="rounded-xl border bg-card p-6 shadow-sm">
            <h2 class="mb-4 text-xl font-bold">Software and tools</h2>
            <ul v-if="job.software.length > 0" class="flex flex-wrap gap-2">
              <li
                v-for="tool in job.software"
                :key="tool"
                class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
                :class="has(tool) ? 'border-blue-300 bg-blue-50 text-blue-900' : 'bg-muted'"
              >
                <CheckCircleIcon v-if="has(tool)" class="size-4 text-blue-700" />
                <XCircleIcon v-else class="size-4 text-muted-foreground" />
                {{ tool }}
                <span class="sr-only">{{ has(tool) ? '(you have this)' : '(you don’t have this yet)' }}</span>
              </li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">No software listed.</p>
          </section>
        </div>

        <div class="space-y-6">
          <section class="rounded-xl border bg-card p-6 shadow-sm">
            <h2 class="mb-4 text-xl font-bold">Key requirements</h2>
            <ul v-if="job.requirements.length > 0" class="list-disc space-y-2 pl-5">
              <li v-for="requirement in job.requirements" :key="requirement">{{ requirement }}</li>
            </ul>
            <p v-else class="text-sm text-muted-foreground">No requirements listed.</p>
          </section>

          <section v-if="job.notes" class="rounded-xl border bg-card p-6 shadow-sm">
            <h2 class="mb-4 text-xl font-bold">Notes</h2>
            <p class="whitespace-pre-wrap">{{ job.notes }}</p>
          </section>

          <section
            v-if="match && match.percentage !== null && match.missing.length > 0"
            class="rounded-xl border border-amber-200 bg-amber-50 p-6"
          >
            <h2 class="mb-3 font-bold text-amber-950">Skills to develop</h2>
            <ul class="flex flex-wrap gap-2">
              <li
                v-for="skill in match.missing"
                :key="skill"
                class="rounded-lg border border-amber-300 bg-white px-3 py-1 text-sm font-medium text-amber-950"
              >
                {{ skill }}
              </li>
            </ul>
          </section>
        </div>
      </div>

      <section v-if="job.rawText" class="rounded-xl border bg-card p-6 shadow-sm">
        <h2 class="mb-4 text-xl font-bold">Original job description</h2>
        <p class="max-h-96 overflow-y-auto rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">{{ job.rawText }}</p>
      </section>
    </article>
  </div>
</template>
