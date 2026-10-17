// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Job } from '../../shared/types';
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

const newJob = { title: 'Vue Developer', company: 'Example Co', skills: ['Vue', 'TypeScript'] };

async function createJob(call: ReturnType<typeof apiAs>, body: object = newJob) {
  const response = await call('POST', '/api/jobs', body);
  expect(response.status).toBe(201);
  return (await response.json()) as Job;
}

describe('/api/jobs', () => {
  it('lists the visitor’s jobs newest first, without saying whose they are', async () => {
    const call = apiAs(platform.env, newIdentity());
    const added = await createJob(call);

    const list = (await (await call('GET', '/api/jobs')).json()) as Job[];

    expect(list[0]).toEqual(added);
    expect(list[0]).not.toHaveProperty('profileId');
    const dates = list.map((job) => job.dateAdded);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('creates a job with defaults, ignoring id, profileId and dateAdded in the body', async () => {
    const call = apiAs(platform.env, newIdentity());

    const job = await createJob(call, {
      ...newJob,
      id: 'chosen-id',
      profileId: 'someone-else',
      dateAdded: '2000-01-01T00:00:00.000Z',
    });

    expect(job).toMatchObject({
      title: 'Vue Developer',
      company: 'Example Co',
      rawText: '',
      skills: ['Vue', 'TypeScript'],
      software: [],
      requirements: [],
      salaryRange: null,
      seniorityLevel: 'not_specified',
      category: null,
      url: null,
      notes: null,
    });
    expect(job.id).not.toBe('chosen-id');
    expect(job.dateAdded).not.toBe('2000-01-01T00:00:00.000Z');
    expect((await call('GET', `/api/jobs/${job.id}`)).status).toBe(200);
  });

  it('refuses a job without a title, or with a non-web address, field by field', async () => {
    const call = apiAs(platform.env, newIdentity());

    const response = await call('POST', '/api/jobs', {
      title: ' ',
      company: 'Example Co',
      url: 'javascript:alert(1)',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Some fields need fixing.',
      fieldErrors: {
        title: 'Enter a job title',
        url: 'Enter a web address starting with http:// or https://',
      },
    });
  });

  it('updates only the fields sent, and an empty update changes nothing', async () => {
    const call = apiAs(platform.env, newIdentity());
    const job = await createJob(call);

    const updated = await call('PATCH', `/api/jobs/${job.id}`, {
      notes: 'Interview on Friday',
      url: 'https://example.com/jobs/1',
    });
    const unchanged = await call('PATCH', `/api/jobs/${job.id}`, {});

    expect(await updated.json()).toEqual({
      ...job,
      notes: 'Interview on Friday',
      url: 'https://example.com/jobs/1',
    });
    expect((await unchanged.json()) as Job).toMatchObject({ notes: 'Interview on Friday' });
  });

  it('deletes a job', async () => {
    const call = apiAs(platform.env, newIdentity());
    const job = await createJob(call);

    expect((await call('DELETE', `/api/jobs/${job.id}`)).status).toBe(204);
    expect((await call('GET', `/api/jobs/${job.id}`)).status).toBe(404);
  });

  it("answers 404 for another visitor's job, whatever the method, and leaves it alone", async () => {
    const owner = apiAs(platform.env, newIdentity());
    const other = apiAs(platform.env, newIdentity());
    const job = await createJob(owner);

    expect((await other('GET', `/api/jobs/${job.id}`)).status).toBe(404);
    expect((await other('PATCH', `/api/jobs/${job.id}`, { title: 'Taken' })).status).toBe(404);
    expect((await other('PATCH', `/api/jobs/${job.id}`, {})).status).toBe(404);
    expect((await other('DELETE', `/api/jobs/${job.id}`)).status).toBe(404);
    const list = (await (await other('GET', '/api/jobs')).json()) as Job[];
    expect(list.map((row) => row.id)).not.toContain(job.id);

    expect(await (await owner('GET', `/api/jobs/${job.id}`)).json()).toEqual(job);
  });
});
