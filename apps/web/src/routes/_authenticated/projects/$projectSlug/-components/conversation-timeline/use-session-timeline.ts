import { useMemo } from "react"
import { useAnnotationsBySession } from "../../../../../../domains/annotations/annotations.collection.ts"
import { useProjectMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import {
  useSessionConversationSpanMaps,
  useSpansBySessionCollection,
} from "../../../../../../domains/spans/spans.collection.ts"
import { useTraceConversationMessages, useTraceDetail } from "../../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import {
  buildConversationTimeline,
  type ConversationTimeline,
  type TimelineMomentInput,
  toSpanIdMap,
} from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import { useAgentGraph } from "../session-detail-drawer/agents-breakdown/use-agent-graph.ts"
import {
  annotatorNameFor,
  toolCallSpanMapFromSpans,
  toTimelineAnnotation,
  toTimelineSpan,
  toTimelineSubagents,
  toTimelineTrace,
} from "./timeline-adapters.ts"

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
  const conversation = useTraceConversationMessages({
    projectId,
    traceId: latestTraceId,
    enabled: traceDetail != null,
  })
  const { data: spans } = useSpansBySessionCollection({
    projectId,
    sessionId: session.sessionId,
    traceIds: session.traceIds,
    startTimeFrom: session.startTime,
    startTimeTo: session.endTime,
  })
  // Cache-only: conversation tab owns the heavy findMessagesForSession fetch.
  // Timeline must not wait on (or trigger) that payload for long sessions.
  const { data: spanMaps } = useSessionConversationSpanMaps({
    projectId,
    sessionId: session.sessionId,
    latestTraceId,
    sessionStartTime: session.startTime,
    sessionEndTime: session.endTime,
    allMessages: conversation.messages,
    enabled: false,
  })
  const { data: annotationsData } = useAnnotationsBySession({
    projectId,
    traceIds: session.traceIds,
    enabled: annotationsEnabled,
  })
  const memberByUserId = useProjectMemberByUserIdMap()
  const agentGraph = useAgentGraph(spans)

  return useMemo(() => {
    if (!traceDetail || conversation.messages.length === 0) return null
    return buildConversationTimeline({
      messages: conversation.messages,
      spans: (spans ?? []).map(toTimelineSpan),
      messageSpanMap: spanMaps ? toSpanIdMap(spanMaps.messageSpanMap) : {},
      toolCallSpanMap: spanMaps ? toSpanIdMap(spanMaps.toolCallSpanMap) : toolCallSpanMapFromSpans(spans),
      traces: traces.map(toTimelineTrace),
      annotations: (annotationsData?.items ?? []).map((a) =>
        toTimelineAnnotation(a, annotatorNameFor(a, memberByUserId)),
      ),
      moments,
      subagents: toTimelineSubagents(agentGraph),
    })
  }, [
    traceDetail,
    spans,
    spanMaps,
    traces,
    annotationsData,
    moments,
    memberByUserId,
    agentGraph,
    conversation.messages,
  ])
}
