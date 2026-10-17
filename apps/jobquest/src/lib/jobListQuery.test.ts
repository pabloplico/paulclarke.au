// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_LIST_QUERY, parseJobListQuery, toRouteQuery } from './jobListQuery';

describe('parseJobListQuery', () => {
  it('defaults to every job, newest first', () => {
    expect(parseJobListQuery({})).toEqual(DEFAULT_JOB_LIST_QUERY);
  });

  it('reads search, filters and sort from the URL', () => {
    expect(
      parseJobListQuery({
        q: 'vue',
        category: 'Design',
        type: 'Developer',
        level: 'senior',
        sort: 'title',
        dir: 'asc',
      })
    ).toEqual({
      search: 'vue',
      category: 'Design',
      type: 'Developer',
      level: 'senior',
      sort: 'title',
      desc: false,
    });
  });

  it('ignores a sort it does not know and takes the first of repeated values', () => {
    expect(parseJobListQuery({ sort: 'salary', dir: 'asc', q: ['a', 'b'] })).toEqual({
      ...DEFAULT_JOB_LIST_QUERY,
      search: 'a',
    });
  });
});

describe('toRouteQuery', () => {
  it('leaves out whatever is at its default, so the plain list has a clean URL', () => {
    expect(toRouteQuery(DEFAULT_JOB_LIST_QUERY)).toEqual({});
    expect(toRouteQuery({ ...DEFAULT_JOB_LIST_QUERY, search: 'vue' })).toEqual({ q: 'vue' });
  });

  it('round-trips through the URL', () => {
    const state = {
      ...DEFAULT_JOB_LIST_QUERY,
      level: 'junior',
      sort: 'match' as const,
      desc: true,
    };

    expect(parseJobListQuery(toRouteQuery(state) as Record<string, string>)).toEqual(state);
  });
});
