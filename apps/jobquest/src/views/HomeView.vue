<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { fetchHealth } from '@/api/health';

const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });
</script>

<template>
  <section aria-labelledby="home-heading" class="space-y-3">
    <h1 id="home-heading" class="text-2xl font-semibold">JobQuest</h1>
    <p class="text-muted-foreground">
      Being rebuilt in Vue 3 on a Hono Worker with D1. The job list arrives next.
    </p>
    <p role="status" class="text-sm text-muted-foreground">
      <template v-if="health.isPending.value">Checking the server…</template>
      <template v-else-if="health.isError.value">The server isn't responding.</template>
      <template v-else>Server and database are up.</template>
    </p>
  </section>
</template>
