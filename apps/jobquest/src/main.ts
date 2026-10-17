import '@fontsource-variable/inter';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';
import App from './App.vue';
import { ApiError } from './api/client';
import { createAppRouter } from './router';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry network and server errors, not answers like 401 or 404
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && error.status < 500),
    },
  },
});

createApp(App).use(VueQueryPlugin, { queryClient }).use(createAppRouter(queryClient)).mount('#app');
