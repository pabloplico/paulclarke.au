<script setup lang="ts">
import { useJobs, useSkills } from '../composables/resources';

// `/` redirects to the first unfinished step before this renders (router.ts). The
// visitor only sees this page if loading their skills or jobs failed.
const skills = useSkills();
const jobs = useJobs();

const retry = () => window.location.reload();
</script>

<template>
  <section class="space-y-3">
    <h1 tabindex="-1" class="text-2xl font-bold outline-none">JobQuest</h1>
    <p v-if="skills.isError.value || jobs.isError.value" role="alert" class="text-destructive">
      Couldn't load your workspace: {{ (skills.error.value ?? jobs.error.value)?.message }}
    </p>
    <p v-else class="text-muted-foreground">Loading your workspace…</p>
    <button
      v-if="skills.isError.value || jobs.isError.value"
      type="button"
      class="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground"
      @click="retry"
    >
      Try again
    </button>
  </section>
</template>
