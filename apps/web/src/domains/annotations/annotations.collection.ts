import type { AnnotationAnchor } from "@domain/scores"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotationsByTrace,
  updateAnnotation,
} from "./annotations.functions.ts"

/** Trace-scoped annotation lists default to including drafts so reload/refetch still shows in-progress rows (`draftedAt` set). */
const DEFAULT_TRACE_DRAFT_MODE = "include" as const

export function useAnnotationsByTrace({
  projectId,
  traceId,
  limit,
  offset,
  draftMode,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly limit?: number
  readonly offset?: number
  readonly draftMode?: "exclude" | "include" | "only"
}) {
  const effectiveDraftMode = draftMode ?? DEFAULT_TRACE_DRAFT_MODE

  return useQuery({
    queryKey: ["annotations", "trace", projectId, traceId, limit, offset, effectiveDraftMode],
    queryFn: () =>
      listAnnotationsByTrace({
        data: { projectId, traceId, limit, offset, draftMode: effectiveDraftMode },
      }),
  })
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      projectId: string
      traceId: string
      spanId?: string
      sessionId?: string
      value: number
      passed: boolean
      feedback: string
      anchor?: AnnotationAnchor
      issueId?: string
    }) => createAnnotation({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}

export function useUpdateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      scoreId: string
      projectId: string
      traceId: string
      value: number
      passed: boolean
      feedback: string
      anchor?: AnnotationAnchor
      issueId?: string
    }) => updateAnnotation({ data: input }),
    onSuccess: (_data, _variables) => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}

export function useDeleteAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { scoreId: string; projectId: string }) => deleteAnnotation({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["annotations"] })
    },
  })
}
