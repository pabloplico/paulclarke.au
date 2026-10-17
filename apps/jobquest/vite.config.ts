import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: 'dist/client',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    // 3002 belongs to the old LAN jobquest service until the import's last PR
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3006',
    },
  },
});
