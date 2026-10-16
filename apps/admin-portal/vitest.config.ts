import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // .next/**: a local `next build` leaves copies of the test files in .next/standalone
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    // Vitest's default is one cache in the workspace root's node_modules, which
    // both apps share: when NX runs them in parallel, one can delete it while the
    // other starts (ENOTEMPTY). Each app keeps its own
    fsModuleCachePath: resolve(__dirname, 'node_modules/.vitest-cache'),
    // Reset every mock before each test: an implementation set by one test
    // (mockResolvedValue, mockImplementation) must not leak into the next.
    // vi.clearAllMocks() only clears calls. restoreMocks wouldn't do: it only
    // restores vi.spyOn spies, so the vi.fn() mocks in module factories keep
    // their leaked implementations
    mockReset: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
