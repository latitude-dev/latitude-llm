import { getAnnotationProvenance } from "@domain/annotations"
import type { AnnotationAnchor } from "@domain/scores"
import type { HighlightRange } from "@repo/ui"
import { useCallback, useMemo } from "react"
import {
  useAnnotationsByTrace,
  useCreateAnnotation,
  useDeleteAnnotation,
  useUpdateAnnotation,
} from "../../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../../domains/annotations/annotations.functions.ts"
import { useMemberByUserIdMap } from "../../../../../../../domains/members/members.collection.ts"
import { pickUserFromMembersMap } from "../../../../../../../domains/members/pick-users-from-members.ts"

const AGENT_ANNOTATOR_ID_PREFIX = "agent:"

interface AnnotationAnnotator {
  readonly id: string
  readonly name: string
  readonly imageSrc: string | null
  readonly kind?: "agent"
}

function buildAgentAnnotator(sourceId: string): AnnotationAnnotator {
  return {
    id: `${AGENT_ANNOTATOR_ID_PREFIX}${sourceId}`,
    name: "Latitude Agent",
    imageSrc: null,
    kind: "agent",
  }
}

export function getAnnotatorIdForBucketing(annotation: AnnotationRecord): string | null {
  if (annotation.annotatorId) return annotation.annotatorId
  if (getAnnotationProvenance(annotation) === "agent") return `${AGENT_ANNOTATOR_ID_PREFIX}${annotation.sourceId}`
  return null
}

interface MessageAnnotationData {
  readonly annotations: readonly AnnotationRecord[]
  readonly annotators: readonly AnnotationAnnotator[]
}

export interface AnnotationFormData {
  readonly passed: boolean
  readonly comment: string
  readonly issueId: string | null
  readonly anchor?: AnnotationAnchor
  readonly spanId?: string | null
}

interface UseTraceAnnotationsDataOptions {
  readonly projectId: string
  readonly traceId: string
}

export function useTraceAnnotationsData({ projectId, traceId }: UseTraceAnnotationsDataOptions) {
  const { data: annotations, isLoading: isAnnotationsLoading } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
  })

  const memberByUserId = useMemberByUserIdMap()

  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()
  const deleteMutation = useDeleteAnnotation()

  const { highlightRanges, messageLevelAnnotations } = useMemo(() => {
    const ranges: HighlightRange[] = []
    const messageMap = new Map<number, MessageAnnotationData>()

    if (!annotations?.items) return { highlightRanges: ranges, messageLevelAnnotations: messageMap }

    for (const a of annotations.items) {
      const { messageIndex, partIndex, startOffset, endOffset } = a.metadata

      if (
        messageIndex !== undefined &&
        partIndex !== undefined &&
        startOffset !== undefined &&
        endOffset !== undefined
      ) {
        ranges.push({
          messageIndex,
          partIndex,
          startOffset,
          endOffset,
          type: "annotation",
          passed: a.passed,
          id: a.id,
        })
      } else if (messageIndex !== undefined && partIndex === undefined) {
        const existing = messageMap.get(messageIndex)
        const existingAnnotations = existing?.annotations ?? []
        const existingAnnotatorIds = new Set(existing?.annotators.map((ann) => ann.id) ?? [])

        const newAnnotators: AnnotationAnnotator[] = [...(existing?.annotators ?? [])]
        if (a.annotatorId && !existingAnnotatorIds.has(a.annotatorId)) {
          const user = pickUserFromMembersMap(memberByUserId, a.annotatorId)
          if (user) {
            newAnnotators.push(user)
          }
        } else if (getAnnotationProvenance(a) === "agent") {
          const agentAnnotator = buildAgentAnnotator(a.sourceId)
          if (!existingAnnotatorIds.has(agentAnnotator.id)) {
            newAnnotators.push(agentAnnotator)
          }
        }

        messageMap.set(messageIndex, {
          annotations: [...existingAnnotations, a],
          annotators: newAnnotators,
        })
      }
    }

    return { highlightRanges: ranges, messageLevelAnnotations: messageMap }
  }, [annotations, memberByUserId])

  const createAnnotation = useCallback(
    (data: AnnotationFormData, options?: { onSuccess?: () => void }) => {
      const feedback = data.comment.trim() || " "
      createMutation.mutate(
        {
          projectId,
          traceId,
          value: data.passed ? 1 : 0,
          passed: data.passed,
          feedback,
          ...(data.issueId ? { issueId: data.issueId } : {}),
          ...(data.spanId ? { spanId: data.spanId } : {}),
          ...(data.anchor ? { anchor: data.anchor } : {}),
        },
        options?.onSuccess ? { onSuccess: options.onSuccess } : undefined,
      )
    },
    [projectId, traceId, createMutation],
  )

  const updateAnnotation = useCallback(
    (scoreId: string, data: AnnotationFormData, options?: { onSuccess?: () => void }) => {
      const feedback = data.comment.trim() || " "
      updateMutation.mutate(
        {
          scoreId,
          projectId,
          traceId,
          value: data.passed ? 1 : 0,
          passed: data.passed,
          feedback,
          ...(data.issueId ? { issueId: data.issueId } : {}),
        },
        options?.onSuccess ? { onSuccess: options.onSuccess } : undefined,
      )
    },
    [projectId, traceId, updateMutation],
  )

  const deleteAnnotation = useCallback(
    (scoreId: string, options?: { onSuccess?: () => void }) => {
      deleteMutation.mutate({ scoreId, projectId }, options?.onSuccess ? { onSuccess: options.onSuccess } : undefined)
    },
    [projectId, deleteMutation],
  )

  return {
    annotations: annotations?.items ?? [],
    isAnnotationsLoading,
    highlightRanges,
    messageLevelAnnotations,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    isCreatePending: createMutation.isPending,
    isUpdatePending: updateMutation.isPending,
    isDeletePending: deleteMutation.isPending,
  }
}
