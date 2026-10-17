<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b bg-card">
      <div class="mx-auto max-w-5xl px-4 py-3">
        <p class="font-semibold text-primary">JobQuest</p>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-8">
      <RouterView />
    </main>
  </div>
</template>
