import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';

/**
 * Every test is a new visitor: the development-only identity cookie gets a unique
 * email, so the server creates (and seeds) a profile for that test alone. Tests
 * can run in parallel on desktop and mobile without seeing each other's changes.
 */
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    await context.addCookies([
      { name: 'jq-dev-identity', value: `e2e-${randomUUID()}@example.com`, url: baseURL },
    ]);
    await use(context);
  },
});

export { expect };
