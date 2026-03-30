import type {
  ExternalUserId,
  OrganizationId,
  ProjectId,
  SessionId,
  SimulationId,
  SpanId,
  TraceId,
} from "@domain/shared"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"

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
  readonly timeToFirstTokenNs: number

  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly tokensTotal: number

  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number

  readonly sessionId: SessionId
  readonly userId: ExternalUserId
  readonly simulationId: SimulationId // optional simulation CUID link, empty string when absent
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly models: readonly string[]
  readonly providers: readonly string[]
  readonly serviceNames: readonly string[]

  readonly rootSpanId: SpanId
  readonly rootSpanName: string
}

/**
 * TraceDetail — the point-lookup shape returned by single-trace queries.
 *
 * Extends Trace with the first input messages, last output messages,
 * and an `allMessages` array that concatenates the last span's input
 * with the last output for a full conversation view.
 */
export interface TraceDetail extends Trace {
  readonly systemInstructions: GenAISystem
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  readonly allMessages: readonly GenAIMessage[]
}
