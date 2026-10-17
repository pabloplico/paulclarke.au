<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline';
import { computed, defineAsyncComponent, useId } from 'vue';
import { type LocationQueryValue, RouterLink, useRoute, useRouter } from 'vue-router';
import { countSkillDemand } from '../../shared/skillMatcher';
import { useJobs } from '../composables/resources';
import { useSkillMatch } from '../composables/useSkillMatch';
import { groupNames, groupsByCategory, skillsByGroup } from '../lib/analytics';

// The charts load only in chart view; the tables need no chart library
const AnalyticsCharts = defineAsyncComponent(() => import('../components/AnalyticsCharts.vue'));

const route = useRoute();
const router = useRouter();
const jobs = useJobs();
const { taxonomy } = useSkillMatch();
const headingId = useId();

// The view and the hidden job categories live in the URL, as the job list's filters do
const asList = (value: LocationQueryValue | LocationQueryValue[] | undefined) =>
  (Array.isArray(value) ? value : [value]).filter((item): item is string => Boolean(item));
const tableView = computed(() => route.query.view === 'table');
const hidden = computed(() => new Set(asList(route.query.hide)));

function setQuery(view: boolean, hide: Set<string>) {
  const query: Record<string, string | string[]> = {};
  if (view) query.view = 'table';
  if (hide.size > 0) query.hide = [...hide].sort();
  void router.replace({ query });
}
const toggleView = () => setQuery(!tableView.value, hidden.value);
function toggleCategory(category: string) {
  const next = new Set(hidden.value);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  setQuery(tableView.value, next);
}
const showAll = () => setQuery(tableView.value, new Set());

const allJobs = computed(() => jobs.data.value ?? []);
const categories = computed(() =>
  [...new Set(allJobs.value.map((job) => job.category ?? 'Other'))].sort().map((name) => ({
    name,
    count: allJobs.value.filter((job) => (job.category ?? 'Other') === name).length,
  }))
);
const shownJobs = computed(() =>
  allJobs.value.filter((job) => !hidden.value.has(job.category ?? 'Other'))
);

const byGroup = computed(() => skillsByGroup(shownJobs.value, taxonomy.value));
const byCategory = computed(() => groupsByCategory(shownJobs.value, taxonomy.value));
const skillCount = computed(() => countSkillDemand(shownJobs.value, taxonomy.value, ['skills']).length);
const toolCount = computed(
  () => countSkillDemand(shownJobs.value, taxonomy.value, ['software']).length
);
const allCount = computed(() => countSkillDemand(shownJobs.value, taxonomy.value).length);

const tableBox = 'overflow-x-auto rounded-xl border bg-card shadow-sm';
</script>

<template>
  <section :aria-labelledby="headingId" class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 :id="headingId" tabindex="-1" class="text-2xl font-bold outline-none">Analytics</h1>
        <p class="mt-1 text-muted-foreground" aria-live="polite">
          What your saved jobs ask for: {{ shownJobs.length }} of {{ allJobs.length }} jobs.
        </p>
      </div>
      <button
        v-if="allJobs.length > 0"
        type="button"
        class="rounded-lg border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
        :aria-pressed="tableView"
        @click="toggleView"
      >
        Show as tables
      </button>
    </div>

    <p v-if="jobs.isPending.value" class="text-muted-foreground">Loading your jobs…</p>
    <p v-else-if="jobs.isError.value" role="alert" class="text-destructive">
      Couldn't load your jobs: {{ jobs.error.value?.message }}
    </p>

    <div v-else-if="allJobs.length === 0" class="rounded-xl border bg-card p-10 text-center">
      <p class="text-muted-foreground">Add some jobs to see which skills and tools come up most.</p>
      <RouterLink
        :to="{ name: 'add-job' }"
        class="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        <PlusIcon class="size-4" />
        Add a job
      </RouterLink>
    </div>

    <template v-else>
      <fieldset class="rounded-xl border bg-card p-4 shadow-sm">
        <legend class="px-1 text-sm font-semibold">Job categories to include</legend>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="category in categories"
            :key="category.name"
            type="button"
            class="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
            :class="
              hidden.has(category.name)
                ? 'bg-card text-muted-foreground'
                : 'border-primary bg-primary text-primary-foreground'
            "
            :aria-pressed="!hidden.has(category.name)"
            @click="toggleCategory(category.name)"
          >
            {{ category.name }}
            <span class="text-xs">({{ category.count }})</span>
          </button>
          <button
            v-if="hidden.size > 0"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent"
            @click="showAll"
          >
            Include all
          </button>
        </div>
      </fieldset>

      <dl class="grid gap-4 sm:grid-cols-3">
        <div class="rounded-xl bg-primary p-5 text-primary-foreground shadow">
          <dt class="text-xs font-bold tracking-wider uppercase">Jobs included</dt>
          <dd class="mt-1 text-4xl font-extrabold">{{ shownJobs.length }}</dd>
        </div>
        <div class="rounded-xl border bg-card p-5 shadow-sm">
          <dt class="text-xs font-bold tracking-wider text-muted-foreground uppercase">Skills and tools</dt>
          <dd class="mt-1 text-4xl font-extrabold text-primary">{{ allCount }}</dd>
          <dd class="text-xs text-muted-foreground">{{ skillCount }} skills, {{ toolCount }} tools</dd>
        </div>
        <div class="rounded-xl border bg-card p-5 shadow-sm">
          <dt class="text-xs font-bold tracking-wider text-muted-foreground uppercase">Groups with skills</dt>
          <dd class="mt-1 text-4xl font-extrabold text-green-700">{{ byGroup.length }}</dd>
          <dd class="text-xs text-muted-foreground">of {{ groupNames.length }}</dd>
        </div>
      </dl>

      <div v-if="shownJobs.length === 0" class="rounded-xl border bg-card p-10 text-center">
        <p class="text-muted-foreground">No jobs in the categories you've included.</p>
        <button type="button" class="mt-3 font-medium text-primary hover:underline" @click="showAll">
          Include all
        </button>
      </div>

      <div v-else-if="tableView" class="grid gap-6 xl:grid-cols-2">
        <!-- Each table scrolls sideways on narrow screens, and holds nothing focusable, so the
             box takes focus to be scrollable by keyboard (WCAG 2.1.1, axe scrollable-region-focusable) -->
        <!-- biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard -->
        <section tabindex="0" aria-label="Skills in demand, by group" :class="tableBox">
          <table class="min-w-full text-sm">
            <caption class="px-4 pt-4 text-left font-semibold">Skills in demand, by group</caption>
            <thead class="text-left text-xs tracking-wider text-muted-foreground uppercase">
              <tr>
                <th scope="col" class="px-4 py-2">Skill</th>
                <th scope="col" class="px-4 py-2 text-right">Jobs</th>
              </tr>
            </thead>
            <tbody v-for="entry in byGroup" :key="entry.group" class="border-t">
              <tr class="bg-muted">
                <th scope="rowgroup" colspan="2" class="px-4 py-2 text-left font-semibold">
                  {{ entry.group }} ({{ entry.total }})
                </th>
              </tr>
              <tr v-for="skill in entry.skills" :key="skill.name" class="border-t">
                <th scope="row" class="px-4 py-1.5 text-left font-normal capitalize">{{ skill.name }}</th>
                <td class="px-4 py-1.5 text-right">{{ skill.count }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <!-- biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard -->
        <section tabindex="0" aria-label="Skill groups by job category" :class="tableBox">
          <table class="min-w-full text-sm">
            <caption class="px-4 pt-4 text-left font-semibold">Skill groups by job category</caption>
            <thead class="text-left text-xs tracking-wider text-muted-foreground uppercase">
              <tr>
                <th scope="col" class="px-4 py-2">Skill group</th>
                <th
                  v-for="category in byCategory.categories"
                  :key="category.name"
                  scope="col"
                  class="px-4 py-2 text-right"
                >
                  {{ category.name }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(group, index) in byCategory.groups" :key="group" class="border-t">
                <th scope="row" class="px-4 py-1.5 text-left font-normal">{{ group }}</th>
                <td
                  v-for="category in byCategory.categories"
                  :key="category.name"
                  class="px-4 py-1.5 text-right"
                >
                  {{ category.values[index] }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <AnalyticsCharts v-else :by-group="byGroup" :by-category="byCategory" />
    </template>
  </section>
</template>
