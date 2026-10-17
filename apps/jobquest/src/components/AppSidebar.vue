<script setup lang="ts">
import { BriefcaseIcon } from '@heroicons/vue/24/outline';
import { RouterLink } from 'vue-router';
import { NAV_ITEMS } from '../navigation';

defineProps<{ email?: string }>();

const mainItems = NAV_ITEMS.filter((item) => !item.advanced);
const advancedItems = NAV_ITEMS.filter((item) => item.advanced);

const linkClass =
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted md:px-4 md:py-3';
const activeClass = 'bg-accent text-accent-foreground hover:bg-accent';
</script>

<template>
  <header class="shrink-0 border-b bg-card md:w-64 md:border-r md:border-b-0">
    <div class="px-4 pt-4 md:px-6 md:pt-6">
      <p class="flex items-center gap-2 text-xl font-bold text-primary">
        <BriefcaseIcon class="size-6" />
        JobQuest
      </p>
      <p class="mt-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Market Analyser
      </p>
      <p v-if="email" class="mt-3 truncate text-sm text-muted-foreground" :title="email">
        Signed in as <span class="font-medium text-foreground">{{ email }}</span>
      </p>
    </div>
    <nav aria-label="Main" class="flex gap-1 overflow-x-auto px-2 py-3 md:flex-col md:px-4 md:py-6">
      <ul class="flex shrink-0 gap-1 md:flex-col">
        <li v-for="item in mainItems" :key="item.name" class="shrink-0">
          <RouterLink :to="{ name: item.name }" :class="linkClass" :exact-active-class="activeClass">
            <component :is="item.icon" class="size-5" />
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
      <p
        id="nav-advanced"
        class="hidden px-4 pt-4 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase md:block"
      >
        Advanced
      </p>
      <ul class="flex shrink-0 gap-1 md:flex-col" aria-labelledby="nav-advanced">
        <li v-for="item in advancedItems" :key="item.name" class="shrink-0">
          <RouterLink :to="{ name: item.name }" :class="linkClass" :exact-active-class="activeClass">
            <component :is="item.icon" class="size-5" />
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
  </header>
</template>
