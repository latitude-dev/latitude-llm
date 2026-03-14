import type { OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import type { GenAIMessage } from "rosetta-ai"

export type TraceStatus = "unset" | "ok" | "error"

/**
 * Trace — the listing shape returned by project-scoped queries.
 *
 * Aggregated from spans via a ClickHouse materialized view.
 * Excludes large LLM content payloads to keep list queries fast.
 */
export interface Trace {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId

  readonly spanCount: number
  readonly errorCount: number

  readonly startTime: Date
  readonly endTime: Date
  readonly durationNs: number

  readonly status: TraceStatus

  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly tokensTotal: number

  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number

  readonly tags: readonly string[]
  readonly models: readonly string[]
  readonly providers: readonly string[]
  readonly serviceNames: readonly string[]

  readonly rootSpanId: SpanId
  readonly rootSpanName: string
}

/**
 * TraceDetail — the point-lookup shape returned by single-trace queries.
 *
 * Extends Trace with the first input and last output messages.
 */
export interface TraceDetail extends Trace {
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
}
