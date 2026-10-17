// A stand-in for the Worker's /api in component tests: an in-memory profile
// behind a stubbed fetch, with the same routes and status codes. It records each
// request so tests can check what the UI sent.
import { vi } from 'vitest';
import { DEFAULT_TAXONOMY } from '../../shared/skillMatcher';
import type { Job, Taxonomy, UserSkill } from '../../shared/types';

export interface FakeRequest {
  method: string;
  path: string;
  body?: unknown;
}

let nextId = 1;
const id = () => `id-${nextId++}`;

export function fakeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: id(),
    title: 'Frontend Developer',
    company: 'Example Co',
    rawText: '',
    skills: [],
    software: [],
    requirements: [],
    salaryRange: null,
    seniorityLevel: 'mid',
    category: 'Technology',
    positionSubcategory: 'Developer',
    dateAdded: '2026-10-01T00:00:00.000Z',
    url: null,
    notes: null,
    ...overrides,
  };
}

export function fakeSkill(name: string, proficiency: UserSkill['proficiency'] = 3): UserSkill {
  return { id: id(), name, proficiency, category: null };
}

export function installFakeApi(
  initial: { jobs?: Job[]; skills?: UserSkill[]; taxonomy?: Taxonomy; signedOut?: boolean } = {}
) {
  // Copies, so one test's edits never reach another test's fixtures
  const state = {
    jobs: structuredClone(initial.jobs ?? []),
    skills: structuredClone(initial.skills ?? []),
    taxonomy: initial.taxonomy ?? { categories: [], ...DEFAULT_TAXONOMY },
  };
  const requests: FakeRequest[] = [];

  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const notFound = () => json({ error: 'Not found' }, 404);

  function handle(method: string, path: string, body: unknown): Response {
    if (initial.signedOut) return json({ error: 'Sign in to use JobQuest.' }, 401);
    const [, , resource, rowId] = path.split('/');
    if (path === '/api/me') return json({ email: 'visitor@example.com' });
    if (path === '/api/taxonomy') return json(state.taxonomy);

    if (resource === 'jobs') {
      if (!rowId && method === 'GET') return json(state.jobs);
      if (!rowId && method === 'POST') {
        const job = fakeJob({ ...(body as Partial<Job>), dateAdded: new Date().toISOString() });
        state.jobs = [job, ...state.jobs];
        return json(job, 201);
      }
      const job = state.jobs.find((candidate) => candidate.id === rowId);
      if (!job) return notFound();
      if (method === 'PATCH') {
        Object.assign(job, body);
        return json(job);
      }
      if (method === 'DELETE') {
        state.jobs = state.jobs.filter((candidate) => candidate !== job);
        return new Response(null, { status: 204 });
      }
      return json(job);
    }

    if (resource === 'skills') {
      if (!rowId && method === 'GET') return json(state.skills);
      if (!rowId && method === 'POST') {
        const input = body as Pick<UserSkill, 'name' | 'proficiency'>;
        const skill = fakeSkill(input.name, input.proficiency);
        state.skills = [...state.skills, skill].sort((a, b) => a.name.localeCompare(b.name));
        return json(skill, 201);
      }
      const skill = state.skills.find((candidate) => candidate.id === rowId);
      if (!skill) return notFound();
      if (method === 'PATCH') {
        Object.assign(skill, body);
        return json(skill);
      }
      if (method === 'DELETE') {
        state.skills = state.skills.filter((candidate) => candidate !== skill);
        return new Response(null, { status: 204 });
      }
    }
    return notFound();
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = new URL(input, 'http://localhost').pathname;
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      requests.push({ method, path, body });
      return handle(method, path, body);
    })
  );

  /** Requests other than reads, in order. */
  const writes = () => requests.filter((request) => request.method !== 'GET');

  return { state, requests, writes };
}
