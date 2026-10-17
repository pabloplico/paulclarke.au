<script setup lang="ts">
import { CheckCircleIcon, XCircleIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<template>
  <!-- Always in the page, so screen readers announce toasts as they're added -->
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed top-4 right-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border-l-4 bg-card p-4 shadow-lg"
      :class="toast.tone === 'error' ? 'border-destructive' : 'border-green-600'"
    >
      <XCircleIcon v-if="toast.tone === 'error'" class="size-6 shrink-0 text-destructive" />
      <CheckCircleIcon v-else class="size-6 shrink-0 text-green-700" />
      <p class="flex-1 font-medium">{{ toast.message }}</p>
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
        @click="dismiss(toast.id)"
      >
        <XMarkIcon class="size-5" />
      </button>
    </div>
  </div>
</template>
