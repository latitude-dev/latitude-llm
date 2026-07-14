import { type ExperimentVariant, ensureBaseline, newVariant, withBaseline } from "@domain/experiments"
import type { FilterSet } from "@domain/shared"
import { type InfiniteTableInfiniteScroll, useToast } from "@repo/ui"
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toUserMessage } from "../../lib/errors.ts"
import {
  createExperiment,
  deleteExperiment,
  type ExperimentComparisonRecord,
  type ExperimentListRow,
  type ExperimentRecord,
  type ExperimentSearchRecord,
  type ExperimentVariantRecord,
  getExperimentBySlug,
  getExperimentComparison,
  listExperiments,
  searchExperimentsOrgWide,
  updateExperiment,
} from "./experiments.functions.ts"

export type { ExperimentComparisonRecord, ExperimentListRow, ExperimentRecord, ExperimentVariantRecord }

const DEFAULT_EXPERIMENTS_PAGE_SIZE = 50
const ORG_SEARCH_LIMIT = 8
const EXPERIMENTS_QUERY_STALE_TIME_MS = 30_000

const getListExperimentsQueryKey = (projectId: string, limit: number, searchQuery: string | undefined) =>
  ["experiments", "list", projectId, limit, searchQuery ?? null] as const

const getExperimentQueryKey = (projectId: string, slug: string) => ["experiments", "get", projectId, slug] as const

const getExperimentComparisonQueryKey = (projectId: string, slug: string) =>
  ["experiments", "comparison", projectId, slug] as const

export function useExperiments(input: {
  readonly projectId: string
  readonly limit?: number
  readonly searchQuery?: string
  readonly enabled?: boolean
}) {
  const limit = input.limit ?? DEFAULT_EXPERIMENTS_PAGE_SIZE
  const trimmedSearchQuery = input.searchQuery?.trim() || undefined

  const { data, isLoading, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: getListExperimentsQueryKey(input.projectId, limit, trimmedSearchQuery),
    queryFn: ({ pageParam }) =>
      listExperiments({
        data: {
          projectId: input.projectId,
          limit,
          offset: pageParam,
          ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    placeholderData: keepPreviousData,
    staleTime: EXPERIMENTS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && input.projectId.length > 0,
  })

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({ hasMore: hasNextPage ?? false, isLoadingMore: isFetchingNextPage, onLoadMore: fetchNextPage }),
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  )

  const rows = useMemo<readonly ExperimentListRow[]>(() => data?.pages.flatMap((page) => page.rows) ?? [], [data])

  return {
    rows,
    totalCount: data?.pages[0]?.totalCount ?? 0,
    isLoading,
    isReloading: isPlaceholderData,
    infiniteScroll,
  }
}

export function useExperiment(input: {
  readonly projectId: string
  readonly slug: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getExperimentQueryKey(input.projectId, input.slug),
    queryFn: (): Promise<ExperimentRecord | null> =>
      getExperimentBySlug({ data: { projectId: input.projectId, slug: input.slug } }),
    staleTime: EXPERIMENTS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && Boolean(input.slug),
  })
}

/** The full comparison payload (per-variant metrics + deltas) for the detail page. */
export function useExperimentComparison(input: {
  readonly projectId: string
  readonly slug: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: getExperimentComparisonQueryKey(input.projectId, input.slug),
    queryFn: (): Promise<ExperimentComparisonRecord | null> =>
      getExperimentComparison({ data: { projectId: input.projectId, slug: input.slug } }),
    staleTime: EXPERIMENTS_QUERY_STALE_TIME_MS,
    enabled: (input.enabled ?? true) && Boolean(input.slug),
  })
}

/** Org-wide experiment name search for the command palette. Only fetches while a query is present. */
export function useExperimentsSearch(input: {
  readonly searchQuery: string
  readonly preferProjectId?: string
  readonly enabled?: boolean
}) {
  const trimmed = input.searchQuery.trim()
  const enabled = (input.enabled ?? true) && trimmed.length > 0
  const { data, isLoading } = useQuery({
    queryKey: ["experiments", "search", trimmed, input.preferProjectId ?? null] as const,
    queryFn: (): Promise<readonly ExperimentSearchRecord[]> =>
      searchExperimentsOrgWide({
        data: {
          searchQuery: trimmed,
          ...(input.preferProjectId ? { preferProjectId: input.preferProjectId } : {}),
          limit: ORG_SEARCH_LIMIT,
        },
      }),
    staleTime: EXPERIMENTS_QUERY_STALE_TIME_MS,
    enabled,
  })
  return { data: data ?? [], isLoading }
}

const invalidateExperimentQueries = (queryClient: ReturnType<typeof useQueryClient>, projectId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["experiments", "list", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["experiments", "get", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["experiments", "comparison", projectId] }),
  ])

export function useCreateExperiment(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { readonly name: string; readonly description?: string }) =>
      createExperiment({
        data: {
          projectId,
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      }),
    onSuccess: () => invalidateExperimentQueries(queryClient, projectId),
  })
}

export function useUpdateExperiment(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      readonly experimentId: string
      readonly name?: string
      readonly description?: string
      readonly variants?: readonly ExperimentVariantRecord[]
    }) =>
      updateExperiment({
        data: {
          experimentId: input.experimentId,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.variants !== undefined ? { variants: [...input.variants] } : {}),
        },
      }),
    onSuccess: () => invalidateExperimentQueries(queryClient, projectId),
  })
}

export function useDeleteExperiment(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (experimentId: string) => deleteExperiment({ data: { experimentId } }),
    onSuccess: () => invalidateExperimentQueries(queryClient, projectId),
  })
}

export interface VariantPatch {
  readonly name?: string
  readonly filterSet?: FilterSet
  readonly query?: string | null
  readonly timeRange?: ExperimentVariantRecord["timeRange"]
}

/**
 * Variant-level actions for the detail page. Each derives the next variants array from the current
 * experiment and persists it through `updateExperiment`, so the single-baseline / naming invariants
 * are enforced server-side. Records are structurally the domain `ExperimentVariant`, so the domain
 * helpers apply directly.
 */
export function useExperimentVariantActions(projectId: string, experiment: ExperimentRecord) {
  const update = useUpdateExperiment(projectId)
  const { toast } = useToast()
  const variants = experiment.variants as readonly ExperimentVariant[]

  const persist = async (next: readonly ExperimentVariant[]) => {
    try {
      await update.mutateAsync({ experimentId: experiment.id, variants: next as readonly ExperimentVariantRecord[] })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      throw error
    }
  }

  return {
    isPending: update.isPending,
    addVariant: () => persist([...variants, newVariant(variants)]),
    addVariantFromSearch: (filterSet: FilterSet, query: string | null, timeRange: ExperimentVariant["timeRange"]) =>
      persist([...variants, { ...newVariant(variants), filterSet, query, timeRange }]),
    renameVariant: (variantId: string, name: string) =>
      persist(variants.map((variant) => (variant.id === variantId ? { ...variant, name } : variant))),
    removeVariant: (variantId: string) =>
      persist(ensureBaseline(variants.filter((variant) => variant.id !== variantId))),
    setBaseline: (variantId: string) => persist(withBaseline(variants, variantId)),
    updateVariant: (variantId: string, patch: VariantPatch) =>
      persist(variants.map((variant) => (variant.id === variantId ? { ...variant, ...patch } : variant))),
    importFromSearch: (
      variantId: string,
      filterSet: FilterSet,
      query: string | null,
      timeRange: ExperimentVariant["timeRange"],
    ) =>
      persist(
        variants.map((variant) => (variant.id === variantId ? { ...variant, filterSet, query, timeRange } : variant)),
      ),
  }
}
