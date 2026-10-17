<script setup lang="ts">
import { computed, useId } from 'vue';

// A label, an optional hint and an error message, wired to the control in the
// slot by id and aria-describedby.
const props = defineProps<{ label: string; error?: string; hint?: string; required?: boolean }>();

const id = useId();
const hintId = `${id}-hint`;
const errorId = `${id}-error`;
const describedBy = computed(
  () => [props.hint && hintId, props.error && errorId].filter(Boolean).join(' ') || undefined
);
</script>

<template>
  <div class="space-y-1">
    <label :for="id" class="block text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive">(required)</span>
    </label>
    <p v-if="hint" :id="hintId" class="text-xs text-muted-foreground">{{ hint }}</p>
    <slot :id="id" :described-by="describedBy" :invalid="error ? true : undefined" />
    <p v-if="error" :id="errorId" class="text-sm font-medium text-destructive">{{ error }}</p>
  </div>
</template>
