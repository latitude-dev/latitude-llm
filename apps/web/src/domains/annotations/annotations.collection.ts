// Annotations use plain useMutation + invalidateQueries instead of createCollection because
// the server owns fields required for the draft lifecycle (draftedAt, id, createdAt). Optimistic
// inserts would need to fake those locally and reconcile — fragile given how isDraftAnnotation
// drives read-only vs editable state. Annotations are also scoped per trace, not a single global
// list, so a collection instance cache would add complexity with no reactive benefit.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  approveSystemAnnotation,
  createAnnotation,
  deleteAnnotation,
  listAnnotationsByTrace,
  rejectSystemAnnotation,
  updateAnnotation,
} from "./annotations.functions.ts"

type CreateAnnotationInput = Parameters<typeof createAnnotation>[0]["data"]
type UpdateAnnotationInput = Parameters<typeof updateAnnotation>[0]["data"]
type DeleteAnnotationInput = Parameters<typeof deleteAnnotation>[0]["data"]

/** Trace-scoped annotation lists default to including drafts so reload/refetch still shows in-progress rows (`draftedAt` set). */
const DEFAULT_TRACE_DRAFT_MODE = "include" as const

export const annotationsByTraceQueryKey = (
  projectId: string,
  traceId: string,
  limit?: number,
  offset?: number,
  draftMode: "exclude" | "include" | "only" = DEFAULT_TRACE_DRAFT_MODE,
) => ["annotations", "trace", projectId, traceId, limit, offset, draftMode] as const

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

export function useApproveSystemAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (scoreId: string) => approveSystemAnnotation({ data: { scoreId } }),
    onMutate: async (scoreId) => {
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
    onError: (_err, _scoreId, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
  })
}

export function useRejectSystemAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (scoreId: string) => rejectSystemAnnotation({ data: { scoreId } }),
    onMutate: async (scoreId) => {
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
    onError: (_err, _scoreId, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data)
        }
      }
    },
  })
}
