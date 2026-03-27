import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotationsByProject,
  listAnnotationsByTrace,
  updateAnnotation,
} from "./annotations.functions.ts"

/** Trace-scoped annotation lists default to including drafts so reload/refetch still shows in-progress rows (`draftedAt` set). */
const DEFAULT_TRACE_DRAFT_MODE = "include" as const

/** Project-wide lists default to **excluding** drafts (domain default). Pass `draftMode: "include"` to show in-progress annotations. */
export function useAnnotationsByProject({
  projectId,
  sourceId,
  limit,
  offset,
  draftMode,
}: {
  readonly projectId: string
  readonly sourceId?: string
  readonly limit?: number
  readonly offset?: number
  readonly draftMode?: "exclude" | "include" | "only"
}) {
  return useQuery({
    queryKey: ["annotations", "project", projectId, sourceId, limit, offset, draftMode],
    queryFn: () => listAnnotationsByProject({ data: { projectId, sourceId, limit, offset, draftMode } }),
  })
}

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
      traceId?: string
      spanId?: string
      sessionId?: string
      value: number
      passed: boolean
      rawFeedback: string
      messageIndex?: number
      partIndex?: number
      startOffset?: number
      endOffset?: number
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
      value: number
      passed: boolean
      rawFeedback: string
      messageIndex?: number
      partIndex?: number
      startOffset?: number
      endOffset?: number
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
