import { useMemo } from "react"
import { useAnnotationsBySession } from "../../../../../../domains/annotations/annotations.collection.ts"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import {
  useSessionConversationSpanMaps,
  useSpansBySessionCollection,
} from "../../../../../../domains/spans/spans.collection.ts"
import { useTraceDetail } from "../../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import {
  buildConversationTimeline,
  type ConversationTimeline,
  type TimelineMomentInput,
} from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import { annotatorNameFor, toTimelineAnnotation, toTimelineSpan, toTimelineTrace } from "./timeline-adapters.ts"

export function useSessionTimeline({
  projectId,
  session,
  traces,
  latestTraceId,
  annotationsEnabled,
  moments,
}: {
  readonly projectId: string
  readonly session: SessionDetailRecord
  readonly traces: readonly TraceRecord[]
  readonly latestTraceId: string
  readonly annotationsEnabled: boolean
  /** Behaviour-moment labels (already fetched by the conversation tab for its pills). */
  readonly moments: readonly TimelineMomentInput[]
}): ConversationTimeline | null {
  const { data: traceDetail } = useTraceDetail({ projectId, traceId: latestTraceId })
  const { data: spans } = useSpansBySessionCollection({
    projectId,
    sessionId: session.sessionId,
    startTimeFrom: session.startTime,
    startTimeTo: session.endTime,
  })
  const { data: spanMaps } = useSessionConversationSpanMaps({
    projectId,
    sessionId: session.sessionId,
    latestTraceId,
    sessionStartTime: session.startTime,
    sessionEndTime: session.endTime,
    allMessages: traceDetail?.allMessages,
    enabled: (traceDetail?.allMessages.length ?? 0) > 0,
  })
  const { data: annotationsData } = useAnnotationsBySession({
    projectId,
    traceIds: session.traceIds,
    enabled: annotationsEnabled,
  })
  const memberByUserId = useMemberByUserIdMap()

  return useMemo(() => {
    if (!traceDetail || !spanMaps) return null
    return buildConversationTimeline({
      messages: traceDetail.allMessages,
      spans: (spans ?? []).map(toTimelineSpan),
      messageSpanMap: spanMaps.messageSpanMap,
      toolCallSpanMap: spanMaps.toolCallSpanMap,
      traces: traces.map(toTimelineTrace),
      annotations: (annotationsData?.items ?? []).map((a) =>
        toTimelineAnnotation(a, annotatorNameFor(a, memberByUserId)),
      ),
      moments,
    })
  }, [traceDetail, spans, spanMaps, traces, annotationsData, moments, memberByUserId])
}
