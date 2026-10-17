<script setup lang="ts">
import { ArrowRightIcon } from '@heroicons/vue/24/outline';
import type { Component } from 'vue';
import { RouterLink } from 'vue-router';
import { type NavItem, navLabel } from '../navigation';

// One topic on the Help page, with links to the pages it covers (named from the nav
// list). It takes focus when a contents link jumps to it (tabindex -1).
defineProps<{ id: string; title: string; icon: Component; pages?: NavItem['name'][] }>();
</script>

<template>
  <section
    :id="id"
    tabindex="-1"
    :aria-labelledby="`${id}-heading`"
    class="scroll-mt-4 rounded-xl border bg-card p-5 shadow-sm outline-none focus-visible:ring-2"
  >
    <h2 :id="`${id}-heading`" class="flex items-center gap-3 text-lg font-bold">
      <span class="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
        <component :is="icon" class="size-5" />
      </span>
      {{ title }}
    </h2>
    <div class="mt-3 space-y-3 leading-relaxed text-muted-foreground sm:pl-11">
      <slot />
      <p v-if="pages?.length" class="flex flex-wrap gap-x-4">
        <RouterLink
          v-for="page in pages"
          :key="page"
          :to="{ name: page }"
          class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Go to {{ navLabel(page) }}
          <ArrowRightIcon class="size-4" />
        </RouterLink>
      </p>
    </div>
  </section>
</template>
