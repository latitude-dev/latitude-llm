import type { SessionAssessmentItem, SessionEvidenceDestination } from "@domain/agent-score"
import { Button, Text } from "@repo/ui"
import {
  useCreateAnnotation,
  useUpdateAnnotation,
} from "../../../../../../domains/annotations/annotations.collection.ts"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import { useScoresBySession } from "../../../../../../domains/scores/scores.collection.ts"
import { useSessionAssessment } from "../../../../../../domains/session-assessments/session-assessments.collection.ts"
import { useSessionSignals } from "../../../../../../domains/sessions/sessions.collection.ts"
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
  onOpenConversation,
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
  readonly onOpenConversation: () => void
}) {
  const { data, isLoading, isError } = useScoresBySession({ projectId, traceIds, limit: 100 })
  const assessment = useSessionAssessment({ projectId, sessionId })
  const { data: signals = [] } = useSessionSignals({ projectId, traceIds })
  const createMutation = useCreateAnnotation()
  const updateMutation = useUpdateAnnotation()
  const representedScoreIds = new Set(assessment.data?.items.flatMap((item) => item.scoreIds) ?? [])
  const otherScores = (data?.items ?? []).filter((score) => !representedScoreIds.has(score.id))

  const updateAnnotation = (
    annotation: AnnotationRecord,
    annotationData: { passed: boolean; comment: string; signalId: string | null },
  ) => {
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
  }

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
      scores={otherScores}
      isLoading={isLoading}
      isError={isError}
      listLabel="Other annotations and evaluations"
      intro={
        <div className="flex flex-col gap-6">
          <SessionAssessmentSection
            projectId={projectId}
            assessment={assessment.data}
            scores={data?.items ?? []}
            signals={signals}
            isLoading={assessment.isLoading || isLoading}
            isError={assessment.isError}
            isUpdateLoading={updateMutation.isPending}
            onUpdate={updateAnnotation}
            onOpenDestination={openAssessmentDestination}
            hasMore={assessment.hasNextPage}
            isLoadingMore={assessment.isFetchingNextPage}
            onLoadMore={assessment.fetchNextPage}
          />
          {latestTraceId.length > 0 ? (
            <div className="flex flex-col items-start gap-1">
              <Text.H6B>Missing something?</Text.H6B>
              <Text.H6 color="foregroundMuted">
                Add feedback about the whole session below, or select a specific part in Conversation to annotate it
                there.
              </Text.H6>
              <Button type="button" variant="link" size="sm" className="h-auto px-0 py-0" onClick={onOpenConversation}>
                Open conversation
              </Button>
            </div>
          ) : null}
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
      onUpdate={updateAnnotation}
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
