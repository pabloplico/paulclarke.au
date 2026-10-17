// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from './index';
import { createTestPlatform, type TestPlatform } from './test/platform';

// Starting wrangler's local runtime takes a few seconds
const STARTUP_MS = 30_000;

describe('with the migrations applied', () => {
  let platform: TestPlatform;
  beforeAll(async () => {
    platform = await createTestPlatform();
  }, STARTUP_MS);
  afterAll(() => platform?.dispose());

  it('reports the server and database up', async () => {
    const response = await app.request('/api/health', {}, platform.env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const response = await app.request('/api/nothing-here', {}, platform.env);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
});

describe('before the migrations', () => {
  let platform: TestPlatform;
  beforeAll(async () => {
    platform = await createTestPlatform({ migrate: false });
  }, STARTUP_MS);
  afterAll(() => platform?.dispose());

  it('reports the database down with a 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await app.request('/api/health', {}, platform.env);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });
});
