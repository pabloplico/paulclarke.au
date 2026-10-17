// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from './index';
import { apiAs, createTestPlatform, STARTUP_MS, type TestPlatform } from './test/platform';

describe('with the migrations applied', () => {
  let platform: TestPlatform;
  beforeAll(async () => {
    platform = await createTestPlatform();
  }, STARTUP_MS);
  afterAll(() => platform?.dispose());

  it('reports the server and database up, without sign-in', async () => {
    const response = await app.request('/api/health', {}, platform.env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
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

describe('sign-in', () => {
  let production: TestPlatform;
  let development: TestPlatform;
  beforeAll(async () => {
    [production, development] = await Promise.all([
      createTestPlatform({
        vars: { ENVIRONMENT: 'production', DEV_ACCESS_IDENTITY: 'dev@example.com' },
      }),
      createTestPlatform({
        vars: { ENVIRONMENT: 'development', DEV_ACCESS_IDENTITY: 'Dev@Example.com ' },
      }),
    ]);
  }, STARTUP_MS);
  afterAll(async () => {
    await Promise.all([production?.dispose(), development?.dispose()]);
  });

  it('refuses every API request in production, whatever the dev identity says', async () => {
    for (const call of [apiAs(production.env), apiAs(production.env, 'someone@example.com')]) {
      for (const path of ['/api/me', '/api/jobs', '/api/skills', '/api/taxonomy']) {
        const response = await call('GET', path);
        expect(response.status, path).toBe(401);
        expect(await response.json()).toEqual({ error: 'Sign in to use JobQuest.' });
      }
    }
  });

  it('uses DEV_ACCESS_IDENTITY in development, lower-cased and trimmed', async () => {
    const response = await apiAs(development.env)('GET', '/api/me');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: 'dev@example.com' });
  });

  it('lets the development identity cookie pick the visitor', async () => {
    const response = await apiAs(development.env, 'Other@Example.com')('GET', '/api/me');

    expect(await response.json()).toEqual({ email: 'other@example.com' });
  });

  it('refuses an identity that is not an email', async () => {
    const response = await apiAs(development.env, 'not-an-email')('GET', '/api/me');

    expect(response.status).toBe(401);
  });

  it('answers unknown API paths with a JSON 404 once signed in', async () => {
    const response = await apiAs(development.env)('GET', '/api/nothing-here');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
});
