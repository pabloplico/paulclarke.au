import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests don't load the Tailwind plugin or the dev proxy
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Repeated from vite.config.ts: Vitest doesn't read it
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    restoreMocks: true,
    // Its own module cache, not the workspace root's one it would share with the
    // other apps (see apps/admin-portal/vitest.config.ts)
    fsModuleCachePath: path.resolve(import.meta.dirname, 'node_modules/.vitest-cache'),
  },
});
