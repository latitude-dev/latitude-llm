import type { OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import type { GenAIMessage } from "rosetta-ai"

export type SpanKind = "unspecified" | "internal" | "server" | "client" | "producer" | "consumer"

export type SpanStatusCode = "unset" | "ok" | "error"

/**
 * Span — the listing/query shape returned by list and trace queries.
 *
 * Excludes the large LLM content payloads (input_messages, output_messages,
 * system_instructions, tool_definitions) to keep list queries fast.
 */
export interface Span {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly parentSpanId: string
  readonly apiKeyId: string
  readonly startTime: Date
  readonly endTime: Date
  readonly name: string
  readonly serviceName: string
  readonly kind: SpanKind
  readonly statusCode: SpanStatusCode
  readonly statusMessage: string
  readonly traceFlags: number
  readonly traceState: string
  readonly errorType: string
  readonly tags: readonly string[]
  readonly eventsJson: string
  readonly linksJson: string
  readonly operation: string
  readonly provider: string
  readonly model: string
  readonly responseModel: string
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number
  readonly costIsEstimated: boolean
  readonly responseId: string
  readonly finishReasons: readonly string[]
  readonly attrString: Readonly<Record<string, string>>
  readonly attrInt: Readonly<Record<string, number>>
  readonly attrFloat: Readonly<Record<string, number>>
  readonly attrBool: Readonly<Record<string, boolean>>
  readonly resourceString: Readonly<Record<string, string>>
  readonly scopeName: string
  readonly scopeVersion: string
  readonly ingestedAt: Date
}

/**
 * SpanDetail — the point-lookup shape returned by single-span queries.
 *
 * Extends Span with parsed LLM content payloads.
 */
export interface SpanDetail extends Span {
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  readonly systemInstructions: string
  readonly toolDefinitions: string
}
