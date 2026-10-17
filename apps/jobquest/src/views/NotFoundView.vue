<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="space-y-3">
    <h1 tabindex="-1" class="text-2xl font-bold outline-none">Page not found</h1>
    <p class="text-muted-foreground">There's no page at this address.</p>
    <RouterLink :to="{ name: 'jobs' }" class="font-medium text-primary hover:underline">
      Go to your job listings
    </RouterLink>
  </section>
</template>
