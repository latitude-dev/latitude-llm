import type { FacetSelection, NewFacetInput } from "@domain/taxonomy"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { behaviourCatalogKey } from "./behaviour-catalog.collection.ts"
import { customBehaviorsListKey } from "./custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "./custom-behaviors.functions.ts"
import {
  createAuthoredBehaviorFn,
  createFacetBehaviorFn,
  type FacetRecord,
  facetAnswersPage,
  facetExtractionProgress,
  listFacets,
  refineBehaviorFn,
  stopBehaviorFn,
} from "./facets.functions.ts"

const facetsKey = (projectId: string) => ["facets", projectId] as const

/**
 * Live cold-start progress for a behavior's extraction. Polls while `enabled` (the
 * view is still gardening) so the panel shows answers streaming in.
 */
export function useFacetExtractionProgress(projectId: string, facetId: string | null, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["facetExtractionProgress", projectId, facetId] as const,
    queryFn: () => facetExtractionProgress({ data: { projectId, facetId: facetId ?? "" } }),
    enabled: enabled && projectId.length > 0 && Boolean(facetId),
    refetchInterval: 2_500,
  })
}

/**
 * A behavior's extracted answers, paginated newest-first for infinite review while
 * it gardens. Polls while `enabled` so new answers surface; rows are deduped by
 * session id in the UI, since live inserts can shift offset-based page edges.
 */
export function useFacetAnswers(projectId: string, facetId: string | null, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: ["facetAnswers", projectId, facetId] as const,
    queryFn: ({ pageParam }) => facetAnswersPage({ data: { projectId, facetId: facetId ?? "", offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: enabled && projectId.length > 0 && Boolean(facetId),
    refetchInterval: enabled ? 5_000 : false,
  })
}

export function useFacetsList(projectId: string, { enabled = true } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: facetsKey(projectId),
    queryFn: () => listFacets({ data: { projectId } }),
    staleTime: 30_000,
    enabled: enabled && projectId.length > 0,
  })
  return { data: data ?? ([] as readonly FacetRecord[]), isLoading }
}

/**
 * Create a behavior and its whole-project view. Invalidates the facet list and the
 * custom-behaviors list, since the new view is a custom behavior.
 */
export function useCreateFacetBehavior(projectId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: facetsKey(projectId) })
    void queryClient.invalidateQueries({ queryKey: customBehaviorsListKey(projectId) })
    void queryClient.invalidateQueries({ queryKey: behaviourCatalogKey(projectId) })
  }
  return useMutation({
    mutationFn: (input: { facetSelection: FacetSelection }): Promise<CustomBehaviorRecord> =>
      createFacetBehaviorFn({ data: { projectId, ...input } }),
    onSuccess: invalidate,
  })
}

/** Create a behavior from the authoring form's own fields, so field rejections keep their paths. */
export function useCreateAuthoredBehavior(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewFacetInput): Promise<CustomBehaviorRecord> =>
      createAuthoredBehaviorFn({ data: { projectId, ...input } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: facetsKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: customBehaviorsListKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: behaviourCatalogKey(projectId) })
    },
  })
}

/**
 * Refresh the facet and custom-behavior lists after a behavior mutation.
 * Stop/refine navigate away first and invalidate AFTER, so the current view's
 * route doesn't flip to "not found" mid-transition when its behavior is deleted.
 */
export function useInvalidateBehaviorQueries(projectId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: facetsKey(projectId) })
    void queryClient.invalidateQueries({ queryKey: customBehaviorsListKey(projectId) })
    void queryClient.invalidateQueries({ queryKey: behaviourCatalogKey(projectId) })
  }
}

/** Stop a running behavior garden and discard the behavior (destructive). Caller navigates, then invalidates. */
export function useStopBehavior() {
  return useMutation({
    mutationFn: (input: { customBehaviorId: string }): Promise<void> => stopBehaviorFn({ data: input }),
  })
}

/**
 * Refine a behavior's instructions: stop + discard the old behavior, create a fresh
 * one, returning the new view. Caller seeds the new view into the list, navigates
 * to it, then invalidates, so neither the old nor the new slug hits "not found".
 */
export function useRefineBehavior(projectId: string) {
  return useMutation({
    mutationFn: (input: { customBehaviorId: string } & NewFacetInput): Promise<CustomBehaviorRecord> =>
      refineBehaviorFn({ data: { projectId, ...input } }),
  })
}
