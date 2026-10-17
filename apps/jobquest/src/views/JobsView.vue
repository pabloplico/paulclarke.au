<script setup lang="ts">
import {
  ArrowDownIcon,
  ArrowsUpDownIcon,
  ArrowUpIcon,
  EyeIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline';
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  type FilterFn,
  filterFn_equalsString,
  functionalUpdate,
  globalFilteringFeature,
  rowSortingFeature,
  type SortingState,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/vue-table';
import { computed, useId, useTemplateRef } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { type Job, SENIORITY_LABELS, type SeniorityLevel } from '../../shared/types';
import InlineDeleteConfirm from '../components/InlineDeleteConfirm.vue';
import JobEditDialog from '../components/JobEditDialog.vue';
import { jobsResource, useJobs } from '../composables/resources';
import { useSkillMatch } from '../composables/useSkillMatch';
import { useToast } from '../composables/useToast';
import {
  type JobListQuery,
  parseJobListQuery,
  type SortKey,
  toRouteQuery,
} from '../lib/jobListQuery';
import type { JobMatch } from '../lib/matching';

interface JobRow {
  job: Job;
  match: JobMatch;
}

const route = useRoute();
const router = useRouter();
const jobs = useJobs();
const { matchFor, skillNames } = useSkillMatch();
const remove = jobsResource.useRemove();
const { show } = useToast();
const editor = useTemplateRef('editor');
const headingId = useId();

// Search, filters and sort live in the URL; replace() so typing doesn't fill the history
const listQuery = computed(() => parseJobListQuery(route.query));
function setQuery(changes: Partial<JobListQuery>) {
  void router.replace({ query: toRouteQuery({ ...listQuery.value, ...changes }) });
}

// The table processes rows; the markup below is ours (headless). Match % is part of
// each row, so the rows (and the sort by match) follow the visitor's skills.
const rows = computed<JobRow[]>(() =>
  (jobs.data.value ?? []).map((job) => ({ job, match: matchFor(job) }))
);

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { equalsString: filterFn_equalsString },
  sortFns: { text: sortFn_text, basic: sortFn_basic },
});
const column = createColumnHelper<typeof features, JobRow>();
const columns = column.columns([
  column.accessor((row) => row.job.title, { id: 'title', sortFn: 'text' }),
  column.accessor((row) => row.job.dateAdded, { id: 'dateAdded', sortFn: 'basic' }),
  // Jobs with nothing to compare sort below every percentage
  column.accessor((row) => row.match.percentage ?? -1, { id: 'match', sortFn: 'basic' }),
  column.accessor((row) => row.job.category ?? '', { id: 'category', filterFn: 'equalsString' }),
  column.accessor((row) => row.job.positionSubcategory ?? '', {
    id: 'type',
    filterFn: 'equalsString',
  }),
  column.accessor((row) => row.job.seniorityLevel, { id: 'level', filterFn: 'equalsString' }),
]);

// The search box matches title or company, as the old app's did
const searchTitleAndCompany: FilterFn<typeof features, JobRow> = (row, _columnId, value) => {
  const needle = String(value).toLowerCase();
  const { title, company } = row.original.job;
  return title.toLowerCase().includes(needle) || company.toLowerCase().includes(needle);
};

const sorting = computed<SortingState>(() => [
  { id: listQuery.value.sort, desc: listQuery.value.desc },
]);
const table = useTable({
  features,
  columns,
  data: rows,
  state: computed(() => ({
    globalFilter: listQuery.value.search,
    columnFilters: (['category', 'type', 'level'] as const)
      .filter((id) => listQuery.value[id])
      .map((id) => ({ id, value: listQuery.value[id] })),
    sorting: sorting.value,
  })),
  globalFilterFn: searchTitleAndCompany,
  getColumnCanGlobalFilter: (col) => col.id === 'title',
  enableSortingRemoval: false,
  onSortingChange: (updater) => {
    const [next] = functionalUpdate(updater, sorting.value);
    if (next) setQuery({ sort: next.id as SortKey, desc: next.desc });
  },
});

const visibleRows = computed(() => table.getRowModel().rows.map((row) => row.original));

// Filter options: only values the visitor's jobs have
const distinct = (values: (string | null)[]) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
const categories = computed(() => distinct((jobs.data.value ?? []).map((job) => job.category)));
const types = computed(() =>
  distinct((jobs.data.value ?? []).map((job) => job.positionSubcategory))
);
const levels = computed(
  () => distinct((jobs.data.value ?? []).map((job) => job.seniorityLevel)) as SeniorityLevel[]
);

const filtered = computed(
  () => Boolean(listQuery.value.search || listQuery.value.category) ||
    Boolean(listQuery.value.type || listQuery.value.level)
);
const clearFilters = () => setQuery({ search: '', category: '', type: '', level: '' });

function sortState(id: SortKey): 'ascending' | 'descending' | 'none' {
  if (listQuery.value.sort !== id) return 'none';
  return listQuery.value.desc ? 'descending' : 'ascending';
}
const toggleSort = (id: SortKey) => table.getColumn(id)?.toggleSorting();

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

function deleteJob(job: Job) {
  remove.mutate(job.id, {
    onSuccess: () => show(`Deleted ${job.title} at ${job.company}.`),
    onError: (error) => show(`Couldn't delete ${job.title}: ${error.message}`, 'error'),
  });
}

const selectClass = 'rounded-lg border border-input bg-card py-2 pr-8 pl-3 text-sm';
</script>

<template>
  <section :aria-labelledby="headingId" class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 :id="headingId" tabindex="-1" class="text-2xl font-bold outline-none">Job Listings</h1>
      <RouterLink
        :to="{ name: 'add-job' }"
        class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-indigo-700"
      >
        <PlusIcon class="size-4" />
        Add a job
      </RouterLink>
    </div>

    <p v-if="jobs.isPending.value" class="text-muted-foreground">Loading your jobs…</p>
    <p v-else-if="jobs.isError.value" role="alert" class="text-destructive">
      Couldn't load your jobs: {{ jobs.error.value?.message }}
    </p>

    <template v-else>
      <div class="flex flex-wrap items-end gap-3">
        <div class="relative min-w-56 flex-1 sm:flex-none">
          <label for="job-search" class="sr-only">Search title or company</label>
          <MagnifyingGlassIcon
            class="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="job-search"
            type="search"
            placeholder="Search title or company"
            class="w-full rounded-lg border border-input bg-card py-2 pr-3 pl-10 sm:w-64"
            :value="listQuery.search"
            @input="setQuery({ search: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Category
          <select
            :class="selectClass"
            :value="listQuery.category"
            @change="setQuery({ category: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">All categories</option>
            <option v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Position type
          <select
            :class="selectClass"
            :value="listQuery.type"
            @change="setQuery({ type: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">All position types</option>
            <option v-for="type in types" :key="type" :value="type">{{ type }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Seniority
          <select
            :class="selectClass"
            :value="listQuery.level"
            @change="setQuery({ level: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">All levels</option>
            <option v-for="level in levels" :key="level" :value="level">
              {{ SENIORITY_LABELS[level] }}
            </option>
          </select>
        </label>
        <button
          v-if="filtered"
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>

      <p aria-live="polite" class="text-sm text-muted-foreground">
        Showing {{ visibleRows.length }} of {{ jobs.data.value?.length ?? 0 }} jobs
      </p>

      <div
        v-if="visibleRows.length > 0"
        class="overflow-x-auto rounded-xl border bg-card shadow-sm"
      >
        <table class="min-w-full divide-y">
          <thead class="bg-muted text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <tr>
              <th scope="col" class="px-4 py-3" :aria-sort="sortState('title')">
                <button type="button" class="inline-flex items-center gap-1 uppercase" @click="toggleSort('title')">
                  Job
                  <ArrowUpIcon v-if="sortState('title') === 'ascending'" class="size-4" />
                  <ArrowDownIcon v-else-if="sortState('title') === 'descending'" class="size-4" />
                  <ArrowsUpDownIcon v-else class="size-4" />
                </button>
              </th>
              <th scope="col" class="px-4 py-3" :aria-sort="sortState('match')">
                <button type="button" class="inline-flex items-center gap-1 uppercase" @click="toggleSort('match')">
                  Match
                  <ArrowUpIcon v-if="sortState('match') === 'ascending'" class="size-4" />
                  <ArrowDownIcon v-else-if="sortState('match') === 'descending'" class="size-4" />
                  <ArrowsUpDownIcon v-else class="size-4" />
                </button>
              </th>
              <th scope="col" class="hidden px-4 py-3 md:table-cell" :aria-sort="sortState('dateAdded')">
                <button type="button" class="inline-flex items-center gap-1 uppercase" @click="toggleSort('dateAdded')">
                  Added
                  <ArrowUpIcon v-if="sortState('dateAdded') === 'ascending'" class="size-4" />
                  <ArrowDownIcon v-else-if="sortState('dateAdded') === 'descending'" class="size-4" />
                  <ArrowsUpDownIcon v-else class="size-4" />
                </button>
              </th>
              <th scope="col" class="hidden px-4 py-3 lg:table-cell">Top skills</th>
              <th scope="col" class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="{ job, match } in visibleRows" :key="job.id" class="align-top hover:bg-muted/50">
              <td class="px-4 py-4">
                <RouterLink
                  :to="{ name: 'job', params: { jobId: job.id } }"
                  class="font-bold text-foreground hover:text-primary hover:underline"
                >
                  {{ job.title }}
                </RouterLink>
                <p class="text-sm text-muted-foreground">{{ job.company }}</p>
                <div class="mt-1 flex flex-wrap gap-1 text-xs font-medium">
                  <span class="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
                    {{ SENIORITY_LABELS[job.seniorityLevel] }}
                  </span>
                  <span v-if="job.category" class="rounded bg-secondary px-2 py-0.5">{{ job.category }}</span>
                  <span v-if="job.positionSubcategory" class="rounded bg-secondary px-2 py-0.5">
                    {{ job.positionSubcategory }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-4 text-sm whitespace-nowrap">
                <span v-if="match.percentage !== null" class="font-semibold">{{ match.percentage }}%</span>
                <span v-else class="text-muted-foreground">
                  <span aria-hidden="true">–</span>
                  <span class="sr-only">{{ skillNames.length === 0 ? 'Add skills to see' : 'No skills listed' }}</span>
                </span>
              </td>
              <td class="hidden px-4 py-4 text-sm whitespace-nowrap text-muted-foreground md:table-cell">
                {{ formatDate(job.dateAdded) }}
              </td>
              <td class="hidden px-4 py-4 lg:table-cell">
                <ul class="flex flex-wrap gap-1" aria-label="Top skills">
                  <li
                    v-for="skill in job.skills.slice(0, 3)"
                    :key="skill"
                    class="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900"
                  >
                    {{ skill }}
                  </li>
                  <li v-if="job.skills.length > 3" class="text-xs text-muted-foreground">
                    +{{ job.skills.length - 3 }} more
                  </li>
                </ul>
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center justify-end gap-2">
                  <a
                    v-if="job.url"
                    :href="job.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="rounded p-1 text-primary hover:bg-accent"
                    :aria-label="`Open the posting for ${job.title} (new tab)`"
                  >
                    <LinkIcon class="size-5" />
                  </a>
                  <RouterLink
                    :to="{ name: 'job', params: { jobId: job.id } }"
                    class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    :aria-label="`View ${job.title} at ${job.company}`"
                  >
                    <EyeIcon class="size-5" />
                  </RouterLink>
                  <button
                    type="button"
                    class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    :aria-label="`Edit ${job.title} at ${job.company}`"
                    @click="editor?.open(job)"
                  >
                    <PencilIcon class="size-5" />
                  </button>
                  <InlineDeleteConfirm
                    :label="`Delete ${job.title} at ${job.company}`"
                    @confirm="deleteJob(job)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="rounded-xl border bg-card p-10 text-center text-muted-foreground">
        <template v-if="(jobs.data.value?.length ?? 0) === 0">
          <p>No jobs yet. Add one to get started.</p>
          <RouterLink
            :to="{ name: 'add-job' }"
            class="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <PlusIcon class="size-4" />
            Add a job
          </RouterLink>
        </template>
        <p v-else>No jobs match your search or filters.</p>
      </div>
    </template>

    <JobEditDialog ref="editor" />
  </section>
</template>
