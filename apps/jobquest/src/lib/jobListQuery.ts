// The job list's search, filters and sort live in the URL query, so a filtered
// list can be bookmarked, shared, and returned to with the Back button. These
// convert between the query and the table's state.
import type { LocationQuery, LocationQueryRaw } from 'vue-router';

export const SORTABLE = ['dateAdded', 'title', 'match'] as const;
export type SortKey = (typeof SORTABLE)[number];

export interface JobListQuery {
  search: string;
  category: string;
  type: string;
  level: string;
  sort: SortKey;
  desc: boolean;
}

export const DEFAULT_JOB_LIST_QUERY: JobListQuery = {
  search: '',
  category: '',
  type: '',
  level: '',
  sort: 'dateAdded',
  desc: true,
};

const first = (value: LocationQuery[string] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export function parseJobListQuery(query: LocationQuery): JobListQuery {
  const sort = first(query.sort);
  const known = (SORTABLE as readonly string[]).includes(sort);
  return {
    search: first(query.q),
    category: first(query.category),
    type: first(query.type),
    level: first(query.level),
    sort: known ? (sort as SortKey) : DEFAULT_JOB_LIST_QUERY.sort,
    // Newest first by default; any other column ascending unless the URL says otherwise
    desc: known ? first(query.dir) === 'desc' : DEFAULT_JOB_LIST_QUERY.desc,
  };
}

/** The URL query for a state, leaving out whatever is at its default. */
export function toRouteQuery(state: JobListQuery): LocationQueryRaw {
  const query: LocationQueryRaw = {};
  if (state.search) query.q = state.search;
  if (state.category) query.category = state.category;
  if (state.type) query.type = state.type;
  if (state.level) query.level = state.level;
  const isDefaultSort =
    state.sort === DEFAULT_JOB_LIST_QUERY.sort && state.desc === DEFAULT_JOB_LIST_QUERY.desc;
  if (!isDefaultSort) {
    query.sort = state.sort;
    query.dir = state.desc ? 'desc' : 'asc';
  }
  return query;
}
