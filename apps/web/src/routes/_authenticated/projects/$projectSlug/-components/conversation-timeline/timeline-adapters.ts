import { getAnnotationProvenance } from "@domain/annotations"
import type { AgentGraph } from "@domain/spans"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import type { MemberRecord } from "../../../../../../domains/members/members.functions.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import type {
  TimelineAnnotationInput,
  TimelineSpanInput,
  TimelineSubagentInput,
  TimelineTraceInput,
} from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"

export function toTimelineSpan(span: SpanRecord): TimelineSpanInput {
  return {
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    traceId: span.traceId,
    startMs: Date.parse(span.startTime),
    endMs: Date.parse(span.endTime),
    ttftMs: span.timeToFirstTokenNs / 1e6,
    isStreaming: span.isStreaming,
    isError: span.statusCode === "error",
    name: span.name,
    operation: span.operation,
    statusMessage: span.statusMessage,
  }
}

export function toTimelineTrace(trace: TraceRecord): TimelineTraceInput {
  return {
    traceId: trace.traceId,
    startMs: Date.parse(trace.startTime),
    endMs: Date.parse(trace.endTime),
    label: trace.rootSpanName || "Unnamed trace",
  }
}

export function annotatorNameFor(
  annotation: AnnotationRecord,
  memberByUserId: ReadonlyMap<string, MemberRecord>,
): string | null {
  if (annotation.annotatorId) return pickUserFromMembersMap(memberByUserId, annotation.annotatorId)?.name ?? null
  return getAnnotationProvenance(annotation) === "agent" ? "Latitude Agent" : null
}

/** Direct subagents of every main root, as spawn markers for the timeline minimap. */
export function toTimelineSubagents(graph: AgentGraph): TimelineSubagentInput[] {
  const out: TimelineSubagentInput[] = []
  for (const root of graph.roots) {
    for (const child of root.children) {
      if (child.kind !== "subagent" || child.ref.spanId === null) continue
      out.push({
        traceId: child.ref.traceId,
        spanId: child.ref.spanId,
        label: child.label,
        toolName: child.trigger.type === "tool" ? child.trigger.toolName : null,
        toolCallId: child.trigger.type === "tool" ? (child.trigger.toolCallId ?? null) : null,
        startMs: child.startTime,
      })
    }
  }
  return out
}

export function toTimelineAnnotation(
  annotation: AnnotationRecord,
  annotatorName: string | null,
): TimelineAnnotationInput {
  return {
    id: annotation.id,
    messageIndex: annotation.metadata?.messageIndex ?? null,
    spanId: annotation.spanId,
    passed: annotation.passed,
    feedback: annotation.feedback,
    flaggerSlug: annotation.metadata?.flaggerSlug ?? null,
    annotatorName,
  }
}
