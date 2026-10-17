<script setup lang="ts">
import { ref, useId } from 'vue';
import { useRouter } from 'vue-router';
import type { FieldErrors } from '../../shared/forms';
import { ApiError } from '../api/client';
import JobForm, { type JobFormValues } from '../components/JobForm.vue';
import { jobsResource } from '../composables/resources';
import { useToast } from '../composables/useToast';

// Typing a job in by hand. Pasting a posting for the AI to fill in comes in J6.
const router = useRouter();
const create = jobsResource.useCreate();
const { show } = useToast();
const headingId = useId();
const serverErrors = ref<FieldErrors>();

function add(values: JobFormValues) {
  create.mutate(values, {
    onSuccess: (job) => {
      show(`Added ${job.title} at ${job.company}.`);
      void router.push({ name: 'job', params: { jobId: job.id } });
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        serverErrors.value = error.fieldErrors;
      } else {
        show(`Couldn't add the job: ${error.message}`, 'error');
      }
    },
  });
}
</script>

<template>
  <section :aria-labelledby="headingId" class="mx-auto max-w-3xl space-y-6">
    <div>
      <h1 :id="headingId" tabindex="-1" class="text-2xl font-bold outline-none">Add Job</h1>
      <p class="mt-1 text-muted-foreground">
        Add a job you're interested in. Its skills feed your match and your skill gaps.
      </p>
    </div>
    <div class="rounded-xl border bg-card p-6 shadow-sm">
      <JobForm
        submit-label="Add job"
        :busy="create.isPending.value"
        :server-errors="serverErrors"
        @submit="add"
        @cancel="router.push({ name: 'jobs' })"
      />
    </div>
  </section>
</template>
