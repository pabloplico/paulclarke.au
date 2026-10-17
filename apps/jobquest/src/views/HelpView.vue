<script setup lang="ts">
import {
  ArrowTrendingUpIcon,
  ChartBarIcon,
  LifebuoyIcon,
  PlusIcon,
  RocketLaunchIcon,
  ScaleIcon,
  TagIcon,
} from '@heroicons/vue/24/outline';
import { nextTick, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import HelpSection from '../components/HelpSection.vue';
import type { NavItem } from '../navigation';

// The guide, covering what's built so far: the AI Skill Builder and paste-and-extract
// (J6) and Find Jobs (J7) add their own parts. Page names come from the nav list.
const SECTIONS = [
  { id: 'getting-started', title: 'Getting started', icon: RocketLaunchIcon, pages: [] },
  { id: 'skills', title: 'Step 1: Add your skills', icon: ScaleIcon, pages: ['skills'] },
  { id: 'collect', title: 'Step 2: Collect jobs', icon: PlusIcon, pages: ['add-job', 'jobs'] },
  { id: 'trends', title: 'Step 3: Spot trends', icon: ChartBarIcon, pages: ['analytics'] },
  { id: 'gaps', title: 'Step 4: Close the gap', icon: ArrowTrendingUpIcon, pages: ['skills'] },
  { id: 'taxonomy', title: 'Taxonomy (advanced)', icon: TagIcon, pages: ['taxonomy'] },
  { id: 'troubleshooting', title: 'Troubleshooting', icon: LifebuoyIcon, pages: [] },
] satisfies { id: string; title: string; icon: unknown; pages: NavItem['name'][] }[];

const section = (id: (typeof SECTIONS)[number]['id']) => {
  const found = SECTIONS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No help section ${id}`);
  return found;
};

// A contents link moves focus to its section, so keyboard and screen-reader users
// land where they jumped to (the router scrolls it into view)
const route = useRoute();
watch(
  () => route.hash,
  async (hash) => {
    if (!hash) return;
    await nextTick();
    document.getElementById(hash.slice(1))?.focus({ preventScroll: true });
  },
  { immediate: true }
);
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div>
      <h1 tabindex="-1" class="text-2xl font-bold outline-none">Help</h1>
      <p class="mt-1 text-muted-foreground">How to get the most out of JobQuest, step by step.</p>
    </div>

    <nav aria-label="Contents">
      <ul class="flex flex-wrap gap-2">
        <li v-for="entry in SECTIONS" :key="entry.id">
          <RouterLink
            :to="{ hash: `#${entry.id}` }"
            class="inline-block rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            {{ entry.title }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <HelpSection v-bind="section('getting-started')">
      <p>
        JobQuest helps you work out what the job market wants and how your skills compare. You save
        the jobs you're interested in, JobQuest counts the skills and tools they ask for, and it
        shows you the trends and your gaps.
      </p>
      <ul class="list-disc space-y-1.5 pl-5">
        <li>Your workspace is yours alone: your jobs, skills and taxonomy are tied to your sign-in.</li>
        <li>
          It starts with six sample jobs from made-up companies, so every page has something to show.
          Delete them whenever you like; they don't come back.
        </li>
        <li>
          The usual order is: add your skills, collect jobs, spot trends, close the gap. The sidebar
          follows that order.
        </li>
      </ul>
    </HelpSection>

    <HelpSection v-bind="section('skills')">
      <p>Your skills are what everything else is compared with, so add them first.</p>
      <ul class="list-disc space-y-1.5 pl-5">
        <li>
          Type a skill, choose your level and press <strong>Add</strong>. The levels are Learning,
          Junior, Mid, Senior and Expert.
        </li>
        <li>
          If the skill is the same as one you have ("JS" when you have "JavaScript"), JobQuest says
          which one rather than adding it twice.
        </li>
        <li>Change a skill's level from your list, or remove it with the bin and then <strong>Remove</strong>.</li>
      </ul>
    </HelpSection>

    <HelpSection v-bind="section('collect')">
      <h3 class="font-semibold text-foreground">Adding a job</h3>
      <ul class="list-disc space-y-1.5 pl-5">
        <li>
          Fill in the title and company, plus whatever else you know: seniority, category, salary,
          the posting's address, skills and tools (separated by commas), key requirements (one per
          line), the description and your notes.
        </li>
        <li>Skills and tools are what your match and Analytics count, so list them carefully.</li>
      </ul>
      <h3 class="font-semibold text-foreground">Your job listings</h3>
      <ul class="list-disc space-y-1.5 pl-5">
        <li>
          Search by title or company, and filter by category, position type or seniority. The search
          and filters stay in the page's address, so you can bookmark a filtered list.
        </li>
        <li>Sort by job, match or date added with the column headings.</li>
        <li>Each job shows your match: the share of its skills and tools you have.</li>
        <li>Edit a job, open its posting, or delete it (the bin, then <strong>Delete</strong>).</li>
        <li>
          A job's own page shows your match, the skills you have and lack, and the skills to
          develop. <strong>Back to job listings</strong> returns you to the list as you left it.
        </li>
      </ul>
    </HelpSection>

    <HelpSection v-bind="section('trends')">
      <ul class="list-disc space-y-1.5 pl-5">
        <li>
          Analytics counts how often each skill and tool appears in your saved jobs. Each job counts
          once per skill.
        </li>
        <li>
          Choose which job categories to include. The treemap shows the skills in demand, in groups;
          the radar compares the groups across job categories.
        </li>
        <li><strong>Show as tables</strong> gives the same numbers as tables.</li>
        <li>
          The more jobs you save, the more meaningful the trends. Aim for ten or more in the same
          field.
        </li>
      </ul>
    </HelpSection>

    <HelpSection v-bind="section('gaps')">
      <ul class="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Matched with the market</strong> lists your skills that appear in your saved jobs,
          and in how many.
        </li>
        <li>
          <strong>Your biggest gaps</strong> lists the 15 skills your jobs ask for most that you
          don't have yet. Those near the top are worth learning first.
        </li>
        <li>If a gap is something you already know, press <strong>+</strong> to add it to your skills.</li>
        <li>
          Matching is forgiving: "JS" and "JavaScript" count as the same skill, and so do near-misses
          like "Kubernets".
        </li>
      </ul>
    </HelpSection>

    <HelpSection v-bind="section('taxonomy')">
      <p>
        The taxonomy decides which skill names mean the same thing and how skills are grouped. You
        can ignore it until the numbers look off.
      </p>
      <ul class="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Merged skills:</strong> count one name as another ("ReactJS" as "React"), or give
          a skill a new name. Merged names count together in Analytics, in your match and in your
          gaps. Press × to undo a merge.
        </li>
        <li>
          <strong>Skill groups:</strong> put the skills from your jobs into groups, and add or delete
          groups. A skill can be in more than one group.
        </li>
        <li>Your workspace starts with common synonyms and groups for web development.</li>
      </ul>
    </HelpSection>

    <HelpSection v-bind="section('troubleshooting')">
      <dl class="space-y-3">
        <div>
          <dt class="font-semibold text-foreground">A skill I have shows as missing</dt>
          <dd>It probably has another name in that job. Merge the two in Taxonomy ("ReactJS" as "React").</dd>
        </div>
        <div>
          <dt class="font-semibold text-foreground">Analytics puts a skill in "Other"</dt>
          <dd>
            Analytics groups skills by keywords in their names, so some fit none of the groups. They
            still count.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-foreground">The sample jobs skew my trends</dt>
          <dd>Delete them in your job listings. They don't come back.</dd>
        </div>
        <div>
          <dt class="font-semibold text-foreground">Where is my data?</dt>
          <dd>In JobQuest's database, tied to your sign-in. No one else sees your jobs, skills or taxonomy.</dd>
        </div>
      </dl>
    </HelpSection>
  </div>
</template>
