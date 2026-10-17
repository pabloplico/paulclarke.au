// Queries and mutations for a per-row resource (/api/jobs, /api/skills). The
// list lives in one cache entry; mutations update it straight away and roll
// back if the server refuses, then refetch to settle on the server's version.
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '../api/client';

interface Row {
  id: string;
}

export function listResource<T extends Row, TInput, TPatch extends object>(options: {
  key: readonly [string];
  path: string;
  /** Where a newly created row goes in the cached list. */
  place: (row: T, list: T[]) => T[];
}) {
  const { key, path, place } = options;

  const queryOptions = { queryKey: key, queryFn: () => api<T[]>(path) };
  const useList = () => useQuery(queryOptions);

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: TInput) => api<T>(path, { method: 'POST', body: input }),
      onSuccess: (row) => queryClient.setQueryData<T[]>(key, (list = []) => place(row, list)),
      onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, changes }: { id: string; changes: TPatch }) =>
        api<T>(`${path}/${id}`, { method: 'PATCH', body: changes }),
      onMutate: async ({ id, changes }) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<T[]>(key);
        queryClient.setQueryData<T[]>(key, (list = []) =>
          list.map((row) => (row.id === id ? { ...row, ...changes } : row))
        );
        return { previous };
      },
      onError: (_error, _variables, context) => queryClient.setQueryData(key, context?.previous),
      onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    });
  }

  function useRemove() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api<void>(`${path}/${id}`, { method: 'DELETE' }),
      onMutate: async (id) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<T[]>(key);
        queryClient.setQueryData<T[]>(key, (list = []) => list.filter((row) => row.id !== id));
        return { previous };
      },
      onError: (_error, _id, context) => queryClient.setQueryData(key, context?.previous),
      onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    });
  }

  return { key, queryOptions, useList, useCreate, useUpdate, useRemove };
}
