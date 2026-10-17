<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/24/outline';
import { nextTick, ref, useId, useTemplateRef } from 'vue';
import type { FieldErrors } from '../../shared/forms';
import type { Job } from '../../shared/types';
import { ApiError } from '../api/client';
import { jobsResource } from '../composables/resources';
import { useToast } from '../composables/useToast';
import JobForm, { type JobFormValues } from './JobForm.vue';

// Editing a job in a native <dialog>: showModal() traps focus and Escape closes
// it, and the browser returns focus to the Edit button afterwards.
const dialog = useTemplateRef('dialog');
const headingId = useId();
const job = ref<Job | null>(null);
const serverErrors = ref<FieldErrors>();

const update = jobsResource.useUpdate();
const { show } = useToast();

async function open(target: Job) {
  job.value = target;
  serverErrors.value = undefined;
  await nextTick();
  dialog.value?.showModal();
}

function close() {
  dialog.value?.close();
}

function save(values: JobFormValues) {
  const target = job.value;
  if (!target) return;
  update.mutate(
    { id: target.id, changes: values },
    {
      onSuccess: () => {
        close();
        show(`Saved ${values.title}.`);
      },
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
          serverErrors.value = error.fieldErrors;
        } else {
          show(`Couldn't save ${values.title}: ${error.message}`, 'error');
        }
      },
    }
  );
}

defineExpose({ open });
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="headingId"
    class="m-auto w-full max-w-2xl rounded-2xl border bg-card p-0 shadow-xl backdrop:bg-gray-900/50"
    @close="job = null"
  >
    <div v-if="job" class="max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b bg-muted px-6 py-4">
        <h2 :id="headingId" class="text-lg font-bold">Edit {{ job.title }}</h2>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground"
          aria-label="Close"
          @click="close"
        >
          <XMarkIcon class="size-6" />
        </button>
      </div>
      <div class="p-6">
        <JobForm
          :key="job.id"
          :job="job"
          submit-label="Save changes"
          :busy="update.isPending.value"
          :server-errors="serverErrors"
          @submit="save"
          @cancel="close"
        />
      </div>
    </div>
  </dialog>
</template>
