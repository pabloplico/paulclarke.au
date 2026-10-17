<script setup lang="ts">
import { TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { nextTick, ref, useTemplateRef } from 'vue';

// A bin button that asks for a second click instead of a browser confirm(). The
// Delete button appears where the bin was and takes focus; Cancel or Escape puts
// the bin back. (The React version also gave up after 4 seconds; that's dropped,
// as a timer can beat a keyboard or screen-reader user to the button.)
const { confirmText = 'Delete' } = defineProps<{
  /** What the bin does, starting with the verb: "Delete Vue Developer at Example Co" */
  label: string;
  confirmText?: string;
}>();
const emit = defineEmits<{ confirm: [] }>();

const pending = ref(false);
const bin = useTemplateRef('bin');
const confirmButton = useTemplateRef('confirmButton');

async function ask() {
  pending.value = true;
  await nextTick();
  confirmButton.value?.focus();
}

async function cancel() {
  pending.value = false;
  await nextTick();
  bin.value?.focus();
}

function confirm(event: MouseEvent) {
  // The second click of a double-click on the bin shouldn't count as confirming
  if (event.detail > 1) return;
  pending.value = false;
  emit('confirm');
}
</script>

<template>
  <button
    v-if="!pending"
    ref="bin"
    type="button"
    class="rounded p-1 text-red-700 hover:bg-red-50"
    :aria-label="label"
    :title="label"
    @click="ask"
  >
    <TrashIcon class="size-5" />
  </button>
  <span v-else class="inline-flex items-center gap-2">
    <button
      type="button"
      class="rounded p-1 text-muted-foreground hover:text-foreground"
      aria-label="Cancel"
      @click="cancel"
      @keydown.esc="cancel"
    >
      <XMarkIcon class="size-5" />
    </button>
    <button
      ref="confirmButton"
      type="button"
      class="rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-800"
      :aria-label="`Yes, ${label.charAt(0).toLowerCase()}${label.slice(1)}`"
      @click="confirm"
      @keydown.esc="cancel"
    >
      {{ confirmText }}
    </button>
  </span>
</template>
