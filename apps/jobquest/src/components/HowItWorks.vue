<script setup lang="ts">
import {
  ArrowTrendingUpIcon,
  ChartBarIcon,
  PlusIcon,
  ScaleIcon,
} from '@heroicons/vue/24/outline';
import { RouterLink } from 'vue-router';
import { type NavItem, navLabel } from '../navigation';

// The four steps of the old app's "How it works", now on the page a new visitor
// lands on. Page names come from the nav list, so they can't drift from the sidebar.
// Find Jobs joins step 2 in J7, and the AI Skill Builder step 1 in J6.
const STEPS: { title: string; text: string; icon: typeof ScaleIcon; pages: NavItem['name'][] }[] = [
  {
    title: 'Add your skills',
    text: 'Tell JobQuest what you can do, and how well.',
    icon: ScaleIcon,
    pages: ['skills'],
  },
  {
    title: 'Collect jobs',
    text: "Add the jobs you're interested in. Six sample jobs are there to start with.",
    icon: PlusIcon,
    pages: ['add-job', 'jobs'],
  },
  {
    title: 'Spot trends',
    text: 'See which skills and tools come up most in your saved jobs.',
    icon: ChartBarIcon,
    pages: ['analytics'],
  },
  {
    title: 'Close the gap',
    text: "See what the market wants that you don't have yet.",
    icon: ArrowTrendingUpIcon,
    pages: ['skills'],
  },
];

</script>

<template>
  <section aria-labelledby="how-it-works-heading" class="space-y-4">
    <h2 id="how-it-works-heading" class="text-lg font-bold">How it works</h2>
    <ol class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <li
        v-for="(step, index) in STEPS"
        :key="step.title"
        class="flex flex-col rounded-xl border bg-card p-4 shadow-sm"
      >
        <p class="flex items-center gap-2 text-xs font-semibold text-primary">
          <span class="flex size-8 items-center justify-center rounded-lg bg-accent">
            <component :is="step.icon" class="size-5" />
          </span>
          Step {{ index + 1 }}
        </p>
        <h3 class="mt-3 font-semibold">{{ step.title }}</h3>
        <p class="mt-1 flex-1 text-sm text-muted-foreground">{{ step.text }}</p>
        <p class="mt-3 flex flex-wrap gap-x-3 text-sm">
          <RouterLink
            v-for="page in step.pages"
            :key="page"
            :to="{ name: page }"
            class="font-medium text-primary hover:underline"
          >
            {{ navLabel(page) }}
          </RouterLink>
        </p>
      </li>
    </ol>
    <RouterLink :to="{ name: 'help' }" class="inline-block font-medium text-primary hover:underline">
      Read the full guide
    </RouterLink>
  </section>
</template>
