import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests don't load the Tailwind plugin or dev proxy
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'server/**/*.test.ts'],
    restoreMocks: true,
    // Its own module cache, not the workspace root's one it would share with the
    // admin portal (see apps/admin-portal/vitest.config.ts)
    fsModuleCachePath: path.resolve(__dirname, 'node_modules/.vitest-cache'),
  },
});
