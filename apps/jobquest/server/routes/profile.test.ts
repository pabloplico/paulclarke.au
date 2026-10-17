// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_GROUPS, DEFAULT_TAXONOMY } from '../../shared/skillMatcher';
import type { Taxonomy } from '../../shared/types';
import {
  apiAs,
  createTestPlatform,
  newIdentity,
  STARTUP_MS,
  type TestPlatform,
} from '../test/platform';

let platform: TestPlatform;
beforeAll(async () => {
  platform = await createTestPlatform({ vars: { ENVIRONMENT: 'development' } });
}, STARTUP_MS);
afterAll(() => platform?.dispose());

const taxonomy: Taxonomy = {
  categories: [{ id: 'web', name: 'Web', color: '#4f46e5' }],
  canonicalMap: { js: 'javascript', 'vue.js': 'vue' },
  skillGroups: { javascript: ['web'], vue: ['web'] },
};

describe('/api/taxonomy', () => {
  it('replaces the visitor’s taxonomy and reads it back', async () => {
    const call = apiAs(platform.env, newIdentity());

    const saved = await call('PUT', '/api/taxonomy', taxonomy);

    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(taxonomy);
    expect(await (await call('GET', '/api/taxonomy')).json()).toEqual(taxonomy);
  });

  it('leaves other visitors’ taxonomies alone', async () => {
    const other = apiAs(platform.env, newIdentity());
    await other('GET', '/api/me');

    await apiAs(platform.env, newIdentity())('PUT', '/api/taxonomy', taxonomy);

    expect(await (await other('GET', '/api/taxonomy')).json()).toEqual({
      categories: DEFAULT_GROUPS,
      ...DEFAULT_TAXONOMY,
    });
  });

  it.each([
    ['a name that is not lower-case', { canonicalMap: { JS: 'javascript' } }],
    ['a skill that counts as itself', { canonicalMap: { js: 'js' } }],
    ['a chain of merges', { canonicalMap: { js: 'ecmascript', ecmascript: 'javascript' } }],
    [
      'groups on a merged skill',
      { canonicalMap: { js: 'javascript' }, skillGroups: { js: ['web'] } },
    ],
    [
      'two groups with one id',
      {
        categories: [
          { id: 'web', name: 'Web', color: '#000000' },
          { id: 'web', name: 'Also web', color: '#111111' },
        ],
      },
    ],
    [
      'a colour that is not a hex colour',
      { categories: [{ id: 'web', name: 'Web', color: 'red' }] },
    ],
  ])('refuses %s', async (_case, change) => {
    const call = apiAs(platform.env, newIdentity());

    const response = await call('PUT', '/api/taxonomy', { ...taxonomy, ...change });

    expect(response.status).toBe(400);
    expect(await (await call('GET', '/api/taxonomy')).json()).toEqual({
      categories: DEFAULT_GROUPS,
      ...DEFAULT_TAXONOMY,
    });
  });
});
