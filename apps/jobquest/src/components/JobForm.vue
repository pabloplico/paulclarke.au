<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef, watch } from 'vue';
import type { z } from 'zod';
import { type FieldErrors, fieldErrors, jobInputSchema, parseList } from '../../shared/forms';
import {
  JOB_CATEGORIES,
  type Job,
  POSITION_SUBCATEGORIES,
  SENIORITY_LABELS,
  SENIORITY_LEVELS,
} from '../../shared/types';
import FormField from './FormField.vue';

export type JobFormValues = z.output<typeof jobInputSchema>;

// Add Job and editing a job: the same fields, checked by the same schema the
// Worker uses. Errors show next to their fields and focus moves to the first.
const props = defineProps<{
  job?: Job;
  submitLabel: string;
  busy?: boolean;
  serverErrors?: FieldErrors;
}>();
const emit = defineEmits<{ submit: [values: JobFormValues]; cancel: [] }>();

const draft = reactive({
  title: props.job?.title ?? '',
  company: props.job?.company ?? '',
  seniorityLevel: props.job?.seniorityLevel ?? 'not_specified',
  category: props.job?.category ?? '',
  positionSubcategory: props.job?.positionSubcategory ?? '',
  salaryRange: props.job?.salaryRange ?? '',
  url: props.job?.url ?? '',
  skills: props.job?.skills.join(', ') ?? '',
  software: props.job?.software.join(', ') ?? '',
  requirements: props.job?.requirements.join('\n') ?? '',
  rawText: props.job?.rawText ?? '',
  notes: props.job?.notes ?? '',
});

// A job's own category or type stays selectable even if it isn't in the built-in lists
const withCurrent = (list: readonly string[], current: string) =>
  current && !list.includes(current) ? [...list, current] : list;
const categories = computed(() => withCurrent(JOB_CATEGORIES, draft.category));
const positionTypes = computed(() => withCurrent(POSITION_SUBCATEGORIES, draft.positionSubcategory));

const errors = ref<FieldErrors>({});
watch(
  () => props.serverErrors,
  (server) => {
    if (server) errors.value = { ...server };
  }
);

const form = useTemplateRef('form');
const FIELD_ORDER = ['title', 'company', 'url', 'salaryRange', 'skills', 'software'];

async function focusFirstError() {
  await nextTick();
  const first = FIELD_ORDER.find((field) => errors.value[field]) ?? Object.keys(errors.value)[0];
  form.value?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
}

function submit() {
  const parsed = jobInputSchema.safeParse({
    ...draft,
    skills: parseList(draft.skills),
    software: parseList(draft.software),
    requirements: parseList(draft.requirements, /\n/),
  });
  if (!parsed.success) {
    errors.value = fieldErrors(parsed.error);
    void focusFirstError();
    return;
  }
  errors.value = {};
  emit('submit', parsed.data);
}

watch(() => props.serverErrors, focusFirstError);

const inputClass =
  'w-full rounded-lg border border-input bg-card px-3 py-2 aria-[invalid=true]:border-destructive';
</script>

<template>
  <form ref="form" novalidate class="space-y-4" @submit.prevent="submit">
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" label="Job title" required :error="errors.title">
        <input
          :id="field.id"
          v-model="draft.title"
          name="title"
          required
          autocomplete="off"
          :class="inputClass"
          :aria-describedby="field.describedBy"
          :aria-invalid="field.invalid"
        />
      </FormField>
      <FormField v-slot="field" label="Company" required :error="errors.company">
        <input
          :id="field.id"
          v-model="draft.company"
          name="company"
          required
          autocomplete="off"
          :class="inputClass"
          :aria-describedby="field.describedBy"
          :aria-invalid="field.invalid"
        />
      </FormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <FormField v-slot="field" label="Seniority">
        <select :id="field.id" v-model="draft.seniorityLevel" name="seniorityLevel" :class="inputClass">
          <option v-for="level in SENIORITY_LEVELS" :key="level" :value="level">
            {{ SENIORITY_LABELS[level] }}
          </option>
        </select>
      </FormField>
      <FormField v-slot="field" label="Industry category">
        <select :id="field.id" v-model="draft.category" name="category" :class="inputClass">
          <option value="">Not set</option>
          <option v-for="category in categories" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </FormField>
      <FormField v-slot="field" label="Position type">
        <select
          :id="field.id"
          v-model="draft.positionSubcategory"
          name="positionSubcategory"
          :class="inputClass"
        >
          <option value="">Not set</option>
          <option v-for="type in positionTypes" :key="type" :value="type">{{ type }}</option>
        </select>
      </FormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" label="Salary" :error="errors.salaryRange">
        <input
          :id="field.id"
          v-model="draft.salaryRange"
          name="salaryRange"
          :class="inputClass"
          :aria-describedby="field.describedBy"
          :aria-invalid="field.invalid"
        />
      </FormField>
      <FormField v-slot="field" label="Job posting address" :error="errors.url">
        <input
          :id="field.id"
          v-model="draft.url"
          name="url"
          type="url"
          inputmode="url"
          placeholder="https://"
          :class="inputClass"
          :aria-describedby="field.describedBy"
          :aria-invalid="field.invalid"
        />
      </FormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField v-slot="field" label="Skills" hint="Separate them with commas." :error="errors.skills">
        <input
          :id="field.id"
          v-model="draft.skills"
          name="skills"
          :class="inputClass"
          :aria-describedby="field.describedBy"
          :aria-invalid="field.invalid"
        />
      </FormField>
      <FormField
        v-slot="field"
        label="Software and tools"
        hint="Separate them with commas."
        :error="errors.software"
      >
        <input
          :id="field.id"
          v-model="draft.software"
          name="software"
          :class="inputClass"
          :aria-describedby="field.describedBy"
          :aria-invalid="field.invalid"
        />
      </FormField>
    </div>

    <FormField v-slot="field" label="Key requirements" hint="One per line." :error="errors.requirements">
      <textarea
        :id="field.id"
        v-model="draft.requirements"
        name="requirements"
        rows="3"
        :class="inputClass"
        :aria-describedby="field.describedBy"
        :aria-invalid="field.invalid"
      />
    </FormField>

    <FormField v-slot="field" label="Job description" :error="errors.rawText">
      <textarea
        :id="field.id"
        v-model="draft.rawText"
        name="rawText"
        rows="6"
        :class="inputClass"
        :aria-describedby="field.describedBy"
        :aria-invalid="field.invalid"
      />
    </FormField>

    <FormField v-slot="field" label="Notes" :error="errors.notes">
      <textarea
        :id="field.id"
        v-model="draft.notes"
        name="notes"
        rows="3"
        placeholder="Interview dates, contacts, thoughts"
        :class="inputClass"
        :aria-describedby="field.describedBy"
        :aria-invalid="field.invalid"
      />
    </FormField>

    <div class="flex justify-end gap-3 pt-2">
      <button
        type="button"
        class="rounded-lg px-4 py-2 font-semibold text-secondary-foreground hover:bg-secondary"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-lg bg-primary px-6 py-2 font-semibold text-primary-foreground hover:bg-indigo-700 disabled:opacity-60"
        :disabled="busy"
      >
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>
