import { getAnnotationProvenance } from "@domain/annotations"
import type { AnnotationRecord } from "../../../../../../domains/annotations/annotations.functions.ts"
import type { MemberRecord } from "../../../../../../domains/members/members.functions.ts"
import { pickUserFromMembersMap } from "../../../../../../domains/members/pick-users-from-members.ts"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import type {
  TimelineAnnotationInput,
  TimelineSpanInput,
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
