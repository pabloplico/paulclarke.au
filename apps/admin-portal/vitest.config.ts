import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**'],
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
