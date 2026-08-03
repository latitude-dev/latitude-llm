import type { Session, SessionDetail } from "@domain/spans"
import { sessionConversationMessages } from "@domain/spans"
import { z } from "@hono/zod-openapi"
import { Paginated } from "../pagination.ts"
import { GenAIMessageSchema } from "./trace.ts"

const nullableString = () => z.string().nullable()
const emptyToNull = (value: string): string | null => (value === "" ? null : value)

/**
 * Fields the session repository accepts as `sortBy`. The API surface narrows the
 * domain's free-form string sort param to a stable allow-list so the SDK and MCP
 * tool inputs document exactly what's tunable.
 */
export const SESSION_SORT_FIELDS = [
  "lastActivity",
  "startTime",
  "duration",
  "ttft",
  "cost",
  "spans",
  "traceCount",
] as const

/**
 * Opaque cursor over the wire — base64url JSON of `{ sortValue, secondaryValue?, sessionId }`.
 * Keeps the public API surface a plain `string` while letting the ClickHouse repo
 * hand back its tuple cursor unchanged.
 */
export const encodeSessionCursor = (cursor: {
  sortValue: string
  secondaryValue?: string | undefined
  sessionId: string
}): string => Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

export const decodeSessionCursor = (
  raw: string,
): { sortValue: string; secondaryValue?: string; sessionId: string } | null => {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as unknown
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof (parsed as { sortValue?: unknown }).sortValue !== "string" ||
      typeof (parsed as { sessionId?: unknown }).sessionId !== "string" ||
      ((parsed as { secondaryValue?: unknown }).secondaryValue !== undefined &&
        typeof (parsed as { secondaryValue?: unknown }).secondaryValue !== "string")
    ) {
      return null
    }
    return parsed as { sortValue: string; secondaryValue?: string; sessionId: string }
  } catch {
    return null
  }
}

const sessionFields = {
  organizationId: z.string().describe("Organization that owns this session."),
  projectId: z.string().describe("Project this session belongs to."),
  sessionId: z.string().describe("Session identifier set by the SDK. Groups the traces of one conversation."),
  traceCount: z.number().int().nonnegative().describe("Number of traces in the session."),
  traceIds: z.array(z.string()).describe("Identifiers of the traces that make up the session."),
  spanCount: z.number().int().nonnegative().describe("Total number of spans across the session's traces."),
  errorCount: z.number().int().nonnegative().describe("Number of spans flagged with an error status."),
  startTime: z.string().describe("ISO-8601 timestamp of the session's earliest span."),
  endTime: z.string().describe("ISO-8601 timestamp of the session's latest span."),
  lastActivityTime: z.string().describe("ISO-8601 timestamp of the session's most recent span start."),
  durationNs: z.number().describe("Active execution time of the session in nanoseconds, not wall-clock."),
  timeToFirstTokenNs: z
    .number()
    .describe("Nanoseconds from the start of the first LLM span to its first emitted token. `0` if not measured."),
  tokensInput: z.number().describe("Total input tokens across the session's LLM spans."),
  tokensOutput: z.number().describe("Total output tokens across the session's LLM spans."),
  tokensCacheRead: z.number().describe("Total tokens served from the provider's prompt cache."),
  tokensCacheCreate: z.number().describe("Total tokens written to the provider's prompt cache."),
  tokensReasoning: z.number().describe("Total reasoning tokens reported by the model."),
  tokensTotal: z.number().describe("Sum of all token counters."),
  costInputMicrocents: z.number().describe("Cost of input tokens in microcents (1/1,000,000 USD)."),
  costOutputMicrocents: z.number().describe("Cost of output tokens in microcents (1/1,000,000 USD)."),
  costTotalMicrocents: z.number().describe("Total cost in microcents (1/1,000,000 USD)."),
  userId: nullableString().describe("End-user identifier set by the SDK. `null` when absent."),
  userEmail: nullableString().describe("End-user email set by the SDK. `null` when absent."),
  simulationId: nullableString().describe(
    "CUID of the simulation that produced this session. `null` when not a simulation.",
  ),
  tags: z.array(z.string()).describe("Free-form tags attached at ingest time."),
  metadata: z.record(z.string(), z.string()).describe("Free-form metadata attached at ingest time."),
  models: z.array(z.string()).describe("Model identifiers seen across the session's LLM spans."),
  providers: z.array(z.string()).describe("LLM-provider identifiers seen across the session's spans."),
  serviceNames: z.array(z.string()).describe("OpenTelemetry `service.name` values seen in the session."),
  agentNames: z.array(z.string()).describe("Agent names seen across the session's spans."),
  definedTools: z.array(z.string()).describe("Tool names declared available across the session's spans."),
  rootSpanId: nullableString().describe(
    "Identifier of the session's root span. `null` when no root span has been ingested.",
  ),
  rootSpanName: nullableString().describe(
    "`name` attribute of the root span. `null` when no root span has been ingested.",
  ),
} as const

const SessionSchema = z.object(sessionFields).openapi("Session")

export const PaginatedSessionsSchema = Paginated(SessionSchema, "PaginatedSessions")

export const SessionDetailSchema = z
  .object({
    ...sessionFields,
    latestTraceId: nullableString().describe(
      "Identifier of the trace that produced the session's latest output. `null` when no trace produced output.",
    ),
    conversation: z
      .array(GenAIMessageSchema)
      .describe(
        "Conversation of the session, in OpenTelemetry GenAI format: the system instructions, then the messages of the session's latest LLM completion, followed by its generated output.",
      ),
  })
  .openapi("SessionDetail")

// ClickHouse doesn't support NULL in our session columns, so the domain entity
// uses `""` as the absent sentinel for SDK-optional ids. Normalise here so the
// public API surface exposes a proper `string | null` instead of leaking the
// storage-layer encoding.
export const toSessionResponse = (session: Session) => ({
  organizationId: session.organizationId as string,
  projectId: session.projectId as string,
  sessionId: session.sessionId as string,
  traceCount: session.traceCount,
  traceIds: [...session.traceIds],
  spanCount: session.spanCount,
  errorCount: session.errorCount,
  startTime: session.startTime.toISOString(),
  endTime: session.endTime.toISOString(),
  lastActivityTime: session.lastActivityTime.toISOString(),
  durationNs: session.durationNs,
  timeToFirstTokenNs: session.timeToFirstTokenNs,
  tokensInput: session.tokensInput,
  tokensOutput: session.tokensOutput,
  tokensCacheRead: session.tokensCacheRead,
  tokensCacheCreate: session.tokensCacheCreate,
  tokensReasoning: session.tokensReasoning,
  tokensTotal: session.tokensTotal,
  costInputMicrocents: session.costInputMicrocents,
  costOutputMicrocents: session.costOutputMicrocents,
  costTotalMicrocents: session.costTotalMicrocents,
  userId: emptyToNull(session.userId as string),
  userEmail: emptyToNull(session.userEmail),
  simulationId: emptyToNull(session.simulationId as string),
  tags: [...session.tags],
  metadata: { ...session.metadata },
  models: [...session.models],
  providers: [...session.providers],
  serviceNames: [...session.serviceNames],
  agentNames: [...session.agentNames],
  definedTools: [...session.definedTools],
  rootSpanId: emptyToNull(session.rootSpanId as string),
  rootSpanName: emptyToNull(session.rootSpanName),
})

// rosetta-ai's `GenAIMessage` type declares a more specific shape than
// `Record<string, unknown>` and TS rejects the direct cast as non-overlapping.
// Going through `unknown` is the documented escape hatch — the payload IS a JSON
// object at runtime, the cast is purely a type-level bridge for the response schema.
export const toSessionDetailResponse = (session: SessionDetail, latestTraceId: string | null) => ({
  ...toSessionResponse(session),
  latestTraceId,
  conversation: sessionConversationMessages(session).map((m) => m as unknown as Record<string, unknown>),
})
