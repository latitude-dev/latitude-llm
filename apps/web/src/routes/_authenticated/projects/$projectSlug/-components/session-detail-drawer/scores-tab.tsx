import { Text } from "@repo/ui"
import {
  useCreateAnnotation,
  useUpdateAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useScoresBySession } from "../../../../../../domains/scores/scores.collection.ts"
import { ScoreList } from "../scores/score-list.tsx"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"

/**
 * Session-wide scores — every score source across the session's traces.
 * Annotation create still targets the latest trace; editing targets each
 * annotation's own trace.
 */
export function ScoresTab({
  projectId,
  traceIds,
  latestTraceId,
  traceNumberById,
  onOpenInConversation,
  onOpenTrace,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly latestTraceId: string
  readonly traceNumberById: ReadonlyMap<string, number>
  readonly onOpenInConversation: (scoreId: string) => void
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
}) {
  const { data, isLoading, isError } = useScoresBySession({ projectId, traceIds })
  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()

  return (
    <ScoreList
      projectId={projectId}
      scores={data?.items ?? []}
      isLoading={isLoading}
      isError={isError}
      showCreateForm={latestTraceId.length > 0}
      createPending={createMutation.isPending}
      onCreate={(annotationData) => {
        if (!latestTraceId) return
        createMutation.mutate({
          projectId,
          traceId: latestTraceId,
          value: annotationData.passed ? 1 : 0,
          passed: annotationData.passed,
          feedback: annotationData.comment.trim(),
          ...(annotationData.signalId ? { signalId: annotationData.signalId } : {}),
        })
      }}
      updatePending={updateMutation.isPending}
      onUpdate={(annotation: AnnotationRecord, annotationData) => {
        const traceId = annotation.traceId ?? ""
        if (!traceId) return
        updateMutation.mutate({
          scoreId: annotation.id,
          projectId,
          traceId,
          value: annotationData.passed ? 1 : 0,
          passed: annotationData.passed,
          feedback: annotationData.comment.trim(),
          signalId: annotationData.signalId ?? undefined,
        })
      }}
      onScoreClick={(score) => {
        if (score.source !== "annotation") return
        const traceId = score.traceId ?? ""
        if (!traceId) return
        if (traceId === latestTraceId) onOpenInConversation(score.id)
        else onOpenTrace(traceId, { focusScoreId: score.id })
      }}
      renderItemAccessory={(score) => {
        const traceNumber = traceNumberById.get(score.traceId ?? "")
        return traceNumber !== undefined ? (
          <Text.H6 color="foregroundMuted" className="px-3 pt-1">
            Trace {traceNumber}
          </Text.H6>
        ) : null
      }}
    />
  )
}
