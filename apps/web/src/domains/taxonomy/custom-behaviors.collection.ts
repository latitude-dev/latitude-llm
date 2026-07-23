import type { FilterSet } from "@domain/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type CustomBehaviorRecord,
  createCustomBehaviorFn,
  deleteCustomBehaviorFn,
  listCustomBehaviors,
  previewCustomBehaviorSample,
  updateCustomBehaviorFn,
} from "./custom-behaviors.functions.ts"

const listKey = (projectId: string) => ["customBehaviors", projectId] as const

// Sort object keys so a FilterSet with the same conditions in a different
// insertion order maps to the same cache key (no spurious preview refetches).
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  )

const previewKey = (projectId: string, filterSet: FilterSet) =>
  ["customBehaviorPreview", projectId, stableStringify(filterSet)] as const

export function useCustomBehaviorsList(projectId: string, { enabled = true } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: listKey(projectId),
    queryFn: () => listCustomBehaviors({ data: { projectId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
    // Poll only while a run is actually in flight so the status badge catches
    // the workflow's generating → ready/failed transition. `pending` is the
    // stable never-generated state, so polling it would run forever.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((behavior) => behavior.status === "generating") ? 5_000 : false,
  })
  return { data: data ?? [], isLoading }
}

export function useCreateCustomBehavior(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; filterSet: FilterSet }): Promise<CustomBehaviorRecord> =>
      createCustomBehaviorFn({ data: { projectId, ...input } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(projectId) }),
  })
}

export function useUpdateCustomBehavior(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; name?: string; filterSet?: FilterSet }): Promise<CustomBehaviorRecord> =>
      updateCustomBehaviorFn({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(projectId) }),
  })
}

export function useDeleteCustomBehavior(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCustomBehaviorFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey(projectId) }),
  })
}

export function useCustomBehaviorPreview(projectId: string, filterSet: FilterSet, { enabled = true } = {}) {
  return useQuery({
    queryKey: previewKey(projectId, filterSet),
    queryFn: () => previewCustomBehaviorSample({ data: { projectId, filterSet } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })
}
