import type { SessionAssessmentItem, SessionEvidenceDestination } from "@domain/agent-score"
import { Text } from "@repo/ui"
import {
  useCreateAnnotation,
  useUpdateAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useScoresBySession } from "../../../../../../domains/scores/scores.collection.ts"
import { flashElement } from "../conversation-timeline/flash-highlight.ts"
import { ScoreList } from "../scores/score-list.tsx"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"
import { SessionAssessmentSection } from "./session-assessment.tsx"

/**
 * Session-wide scores — every score source across the session's traces.
 * Annotation create still targets the latest trace; editing targets each
 * annotation's own trace.
 */
export function ScoresTab({
  projectId,
  sessionId,
  traceIds,
  latestTraceId,
  traceNumberById,
  onOpenInConversation,
  onOpenTrace,
  onOpenSpan,
  onOpenSignal,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceIds: readonly string[]
  readonly latestTraceId: string
  readonly traceNumberById: ReadonlyMap<string, number>
  readonly onOpenInConversation: (scoreId: string) => void
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
  readonly onOpenSpan: (spanId: string, traceId?: string) => void
  readonly onOpenSignal: (signalId: string) => void
}) {
  const { data, isLoading, isError } = useScoresBySession({ projectId, traceIds })
  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()

  const openScore = (scoreId: string) => {
    const score = data?.items.find((candidate) => candidate.id === scoreId)
    const traceId = score?.traceId ?? ""
    if (score?.source === "annotation" && traceId) {
      if (traceId === latestTraceId) onOpenInConversation(score.id)
      else onOpenTrace(traceId, { focusScoreId: score.id })
      return
    }

    const element = [...document.querySelectorAll<HTMLElement>("[data-score-id]")].find(
      (candidate) => candidate.dataset.scoreId === scoreId,
    )
    if (!element) return
    element.scrollIntoView({ block: "center", behavior: "smooth" })
    flashElement(element)
  }

  const openAssessmentDestination = (destination: SessionEvidenceDestination, item: SessionAssessmentItem) => {
    switch (destination.kind) {
      case "sessionMessage":
        onOpenTrace(destination.traceId, { focusMessageIndex: destination.messageIndex })
        return
      case "span":
        onOpenSpan(destination.spanId, destination.traceId)
        return
      case "toolCall": {
        const anchor = item.anchors.find(
          (candidate) => candidate.kind === "toolCall" && candidate.toolCallId === destination.toolCallId,
        )
        onOpenTrace(destination.traceId, {
          targetTab: "conversation",
          ...(anchor?.kind === "toolCall" && anchor.messageIndex !== undefined
            ? { focusMessageIndex: anchor.messageIndex }
            : {}),
        })
        return
      }
      case "score":
        openScore(destination.scoreId)
        return
      case "signal":
        onOpenSignal(destination.signalId)
        return
      case "memoryEvent":
        return
    }
  }

  return (
    <ScoreList
      projectId={projectId}
      scores={data?.items ?? []}
      isLoading={isLoading}
      isError={isError}
      intro={
        <div className="flex flex-col gap-6">
          <SessionAssessmentSection
            projectId={projectId}
            sessionId={sessionId}
            onOpenDestination={openAssessmentDestination}
          />
          <div className="flex flex-col gap-1">
            <Text.H4M>Annotations and evaluations</Text.H4M>
            <Text.H6 color="foregroundMuted">Review or add judgments attached to this session.</Text.H6>
          </div>
        </div>
      }
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
