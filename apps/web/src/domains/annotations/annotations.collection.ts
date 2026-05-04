// Annotations use plain useMutation + invalidateQueries instead of createCollection because
// the server owns fields required for the draft lifecycle (draftedAt, id, createdAt). Optimistic
// inserts would need to fake those locally and reconcile — fragile given how isDraftAnnotation
// drives read-only vs editable state. Annotations are also scoped per trace, not a single global
// list, so a collection instance cache would add complexity with no reactive benefit.
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  approveSystemAnnotation,
  createAnnotation,
  deleteAnnotation,
  listAnnotationCountsByTraceIds,
  listAnnotationsByTrace,
  rejectSystemAnnotation,
  type TraceAnnotationCountsRecord,
  updateAnnotation,
} from "./annotations.functions.ts"

type CreateAnnotationInput = Parameters<typeof createAnnotation>[0]["data"]
type UpdateAnnotationInput = Parameters<typeof updateAnnotation>[0]["data"]
type DeleteAnnotationInput = Parameters<typeof deleteAnnotation>[0]["data"]

/** Trace-scoped annotation lists default to including drafts so reload/refetch still shows in-progress rows (`draftedAt` set). */
const DEFAULT_TRACE_DRAFT_MODE = "include" as const

const annotationsByTraceQueryKey = (
  projectId: string,
  traceId: string,
  limit?: number,
  offset?: number,
  draftMode: "exclude" | "include" | "only" = DEFAULT_TRACE_DRAFT_MODE,
) => ["annotations", "trace", projectId, traceId, limit, offset, draftMode] as const

const annotationCountsByTraceIdsQueryKey = (
  projectId: string,
  traceIds: readonly string[],
  draftMode: "exclude" | "include" | "only" = DEFAULT_TRACE_DRAFT_MODE,
) => ["annotations", "trace-counts", projectId, traceIds, draftMode] as const

const TRACE_COUNT_BATCH_SIZE = 50

const chunkTraceIds = (traceIds: readonly string[]): readonly string[][] => {
  const chunks: string[][] = []
  for (let i = 0; i < traceIds.length; i += TRACE_COUNT_BATCH_SIZE) {
    chunks.push(traceIds.slice(i, i + TRACE_COUNT_BATCH_SIZE))
  }
  return chunks
}

export function useAnnotationsByTrace({
  projectId,
  traceId,
  limit,
  offset,
  draftMode,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly limit?: number
  readonly offset?: number
  readonly draftMode?: "exclude" | "include" | "only"
  readonly enabled?: boolean
}) {
  const effectiveDraftMode = draftMode ?? DEFAULT_TRACE_DRAFT_MODE

  return useQuery({
    queryKey: annotationsByTraceQueryKey(projectId, traceId, limit, offset, effectiveDraftMode),
    queryFn: () =>
      listAnnotationsByTrace({
        data: { projectId, traceId, limit, offset, draftMode: effectiveDraftMode },
      }),
    enabled,
  })
}

export function useAnnotationCountsByTraceIds({
  projectId,
  traceIds,
  draftMode,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly draftMode?: "exclude" | "include" | "only"
  readonly enabled?: boolean
}) {
  const effectiveDraftMode = draftMode ?? DEFAULT_TRACE_DRAFT_MODE
  const uniqueTraceIds = useMemo(() => [...new Set(traceIds)].sort(), [traceIds])
  const chunks = useMemo(() => chunkTraceIds(uniqueTraceIds), [uniqueTraceIds])

  const queries = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: annotationCountsByTraceIdsQueryKey(projectId, chunk, effectiveDraftMode),
      queryFn: () =>
        listAnnotationCountsByTraceIds({
          data: { projectId, traceIds: chunk, draftMode: effectiveDraftMode },
        }),
      enabled: enabled && projectId.length > 0 && chunk.length > 0,
      staleTime: 30_000,
    })),
  })

  const data = useMemo(() => {
    const countsByTraceId = new Map<string, TraceAnnotationCountsRecord>()
    for (const query of queries) {
      for (const counts of query.data ?? []) {
        countsByTraceId.set(counts.traceId, counts)
      }
    }
    return countsByTraceId
  }, [queries])

  const pendingTraceIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [index, query] of queries.entries()) {
      if (!query.isLoading) continue
      for (const traceId of chunks[index] ?? []) {
        ids.add(traceId)
      }
    }
    return ids
  }, [chunks, queries])

  return {
    data,
    pendingTraceIds,
    isLoading: queries.some((query) => query.isLoading),
    isFetching: queries.some((query) => query.isFetching),
  }
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateAnnotationInput) => createAnnotation({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}

export function useUpdateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateAnnotationInput) => updateAnnotation({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}

export function useDeleteAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DeleteAnnotationInput) => deleteAnnotation({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}

type AnnotationsPage = Awaited<ReturnType<typeof listAnnotationsByTrace>>

interface ApproveSystemAnnotationInput {
  readonly scoreId: string
  readonly comment?: string
}

export function useApproveSystemAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ApproveSystemAnnotationInput) =>
      approveSystemAnnotation({
        data: { scoreId: input.scoreId, ...(input.comment !== undefined ? { comment: input.comment } : {}) },
      }),
    onMutate: async ({ scoreId }) => {
      await queryClient.cancelQueries({ queryKey: ["annotations"] })

      const previousData = queryClient.getQueriesData<AnnotationsPage>({ queryKey: ["annotations"] })

      queryClient.setQueriesData<AnnotationsPage>({ queryKey: ["annotations"] }, (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((annotation) =>
            annotation.id === scoreId ? { ...annotation, draftedAt: null } : annotation,
          ),
        }
      })

      return { previousData }
    },
    onError: (_err, _input, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}

interface RejectSystemAnnotationInput {
  readonly scoreId: string
  readonly comment: string
}

export function useRejectSystemAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RejectSystemAnnotationInput) =>
      rejectSystemAnnotation({ data: { scoreId: input.scoreId, comment: input.comment } }),
    onMutate: async ({ scoreId }) => {
      await queryClient.cancelQueries({ queryKey: ["annotations"] })

      const previousData = queryClient.getQueriesData<AnnotationsPage>({ queryKey: ["annotations"] })

      queryClient.setQueriesData<AnnotationsPage>({ queryKey: ["annotations"] }, (old) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.filter((annotation) => annotation.id !== scoreId),
        }
      })

      return { previousData }
    },
    onError: (_err, _input, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}
