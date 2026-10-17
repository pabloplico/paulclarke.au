// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UserSkill } from '../../shared/types';
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

async function addSkill(call: ReturnType<typeof apiAs>, body: object) {
  const response = await call('POST', '/api/skills', body);
  expect(response.status).toBe(201);
  return (await response.json()) as UserSkill;
}

describe('/api/skills', () => {
  it('adds skills at Mid level by default and lists them by name', async () => {
    const call = apiAs(platform.env, newIdentity());
    await addSkill(call, { name: 'Vue' });
    await addSkill(call, { name: 'Accessibility', proficiency: 4 });

    const list = (await (await call('GET', '/api/skills')).json()) as UserSkill[];

    expect(
      list.map(({ name, proficiency, category }) => ({ name, proficiency, category }))
    ).toEqual([
      { name: 'Accessibility', proficiency: 4, category: null },
      { name: 'Vue', proficiency: 3, category: null },
    ]);
  });

  it('refuses a skill the visitor already has, in any case, with a 409', async () => {
    const call = apiAs(platform.env, newIdentity());
    await addSkill(call, { name: 'TypeScript' });

    const response = await call('POST', '/api/skills', { name: 'typescript' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'You already have typescript.',
      fieldErrors: { name: 'You already have typescript.' },
    });
  });

  it('lets two visitors have the same skill', async () => {
    await addSkill(apiAs(platform.env, newIdentity()), { name: 'CSS' });
    await addSkill(apiAs(platform.env, newIdentity()), { name: 'CSS' });
  });

  it('refuses a proficiency outside 1 to 5', async () => {
    const call = apiAs(platform.env, newIdentity());

    const response = await call('POST', '/api/skills', { name: 'Vue', proficiency: 6 });

    expect(response.status).toBe(400);
  });

  it('changes a skill, and refuses renaming it to one the visitor has', async () => {
    const call = apiAs(platform.env, newIdentity());
    const vue = await addSkill(call, { name: 'Vue' });
    await addSkill(call, { name: 'React' });

    const levelled = await call('PATCH', `/api/skills/${vue.id}`, { proficiency: 5 });
    const clash = await call('PATCH', `/api/skills/${vue.id}`, { name: 'react' });

    expect(await levelled.json()).toEqual({ ...vue, proficiency: 5 });
    expect(clash.status).toBe(409);
  });

  it('removes a skill', async () => {
    const call = apiAs(platform.env, newIdentity());
    const skill = await addSkill(call, { name: 'Vue' });

    expect((await call('DELETE', `/api/skills/${skill.id}`)).status).toBe(204);
    expect(await (await call('GET', '/api/skills')).json()).toEqual([]);
  });

  it("answers 404 for another visitor's skill, whatever the method, and leaves it alone", async () => {
    const owner = apiAs(platform.env, newIdentity());
    const other = apiAs(platform.env, newIdentity());
    const skill = await addSkill(owner, { name: 'Vue' });

    expect((await other('PATCH', `/api/skills/${skill.id}`, { proficiency: 1 })).status).toBe(404);
    expect((await other('PATCH', `/api/skills/${skill.id}`, {})).status).toBe(404);
    expect((await other('DELETE', `/api/skills/${skill.id}`)).status).toBe(404);
    expect(await (await other('GET', '/api/skills')).json()).toEqual([]);

    expect(await (await owner('GET', '/api/skills')).json()).toEqual([skill]);
  });
});
