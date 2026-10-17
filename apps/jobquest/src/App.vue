<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { ApiError } from './api/client';
import AppSidebar from './components/AppSidebar.vue';
import SignInRequired from './components/SignInRequired.vue';
import ToastHost from './components/ToastHost.vue';
import { useMe } from './composables/resources';
import { provideToasts } from './composables/useToast';

provideToasts();
const me = useMe();
const route = useRoute();

const signedOut = computed(() => me.error.value instanceof ApiError && me.error.value.status === 401);

// A new page (not just a new query, such as typing in the job search) moves focus
// to its heading, so screen readers announce it and Tab starts from there
watch(
  () => route.path,
  async (_path, previous) => {
    if (previous === undefined) return;
    await nextTick();
    document.querySelector<HTMLElement>('main h1')?.focus();
  },
  { flush: 'post' }
);
</script>

<template>
  <a
    href="#main"
    class="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  >
    Skip to content
  </a>
  <SignInRequired v-if="signedOut" />
  <div v-else class="flex min-h-screen flex-col md:flex-row">
    <AppSidebar :email="me.data.value?.email" />
    <main id="main" tabindex="-1" class="min-w-0 flex-1 p-4 outline-none md:p-8">
      <RouterView />
    </main>
  </div>
  <ToastHost />
</template>
