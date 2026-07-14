import { useMemo } from "react"
import { useAnnotationsByTrace } from "../../../../../../domains/annotations/annotations.collection.ts"
import { useProjectMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import { useConversationSpanMaps } from "../../../../../../domains/spans/spans.collection.ts"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import { useTraceConversationMessages } from "../../../../../../domains/traces/traces.collection.ts"
import type { TraceDetailRecord, TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import {
  buildConversationTimeline,
  type ConversationTimeline,
  toSpanIdMap,
} from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import { useAgentGraph } from "../session-detail-drawer/agents-breakdown/use-agent-graph.ts"
import {
  annotatorNameFor,
  toTimelineAnnotation,
  toTimelineSpan,
  toTimelineSubagents,
  toTimelineTrace,
} from "./timeline-adapters.ts"

export function useTraceTimeline({
  projectId,
  traceId,
  traceRecord,
  traceDetail,
  spans,
  annotationsEnabled,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly traceRecord: TraceRecord | undefined
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly spans: readonly SpanRecord[] | undefined
  readonly annotationsEnabled: boolean
}): ConversationTimeline | null {
  const conversation = useTraceConversationMessages({
    projectId,
    traceId,
    enabled: traceDetail != null,
  })
  const { data: spanMaps } = useConversationSpanMaps({
    projectId,
    traceId,
    startTime: traceDetail?.startTime,
    allMessages: conversation.messages,
    enabled: conversation.messages.length > 0,
  })
  const { data: annotationsData } = useAnnotationsByTrace({
    projectId,
    traceId,
    draftMode: "include",
    enabled: annotationsEnabled,
  })
  const memberByUserId = useProjectMemberByUserIdMap()
  const agentGraph = useAgentGraph(spans)

  return useMemo(() => {
    if (!traceDetail || !spanMaps || conversation.messages.length === 0) return null
    return buildConversationTimeline({
      messages: conversation.messages,
      spans: (spans ?? []).map(toTimelineSpan),
      messageSpanMap: toSpanIdMap(spanMaps.messageSpanMap),
      toolCallSpanMap: toSpanIdMap(spanMaps.toolCallSpanMap),
      traces: [toTimelineTrace(traceRecord ?? traceDetail)],
      annotations: (annotationsData?.items ?? []).map((a) =>
        toTimelineAnnotation(a, annotatorNameFor(a, memberByUserId)),
      ),
      moments: [],
      subagents: toTimelineSubagents(agentGraph),
    })
  }, [traceDetail, traceRecord, spans, spanMaps, annotationsData, memberByUserId, agentGraph, conversation.messages])
}
