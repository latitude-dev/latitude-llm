import {
  externalUserIdSchema,
  organizationIdSchema,
  projectIdSchema,
  sessionIdSchema,
  simulationIdSchema,
  spanIdSchema,
} from "@domain/shared"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { z } from "zod"

/**
 * Session — aggregated from spans that share a session_id.
 *
 * A session groups one or more traces representing multi-turn
 * interactions between a user and the system. Populated by a
 * ClickHouse materialized view on each insert into spans.
 *
 * `durationNs` is **active execution time** (sum of root-span durations across
 * the session's traces), not wall-clock. Wall-clock is recoverable as
 * `endTime - startTime` when needed. See specs/session-problems/1-parity-traces-sessions.md
 * "On `duration_ns` semantics" for the rationale.
 */
export const sessionSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,

  traceCount: z.number().int().nonnegative(),
  traceIds: z.array(z.string()).readonly(),
  spanCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),

  startTime: z.date(),
  endTime: z.date(),
  // Latest span start in the session — sort key for "most recently active".
  // Mirrors how traces use `startTime` for the same default ordering.
  lastActivityTime: z.date(),
  durationNs: z.number(),
  timeToFirstTokenNs: z.number(),

  tokensInput: z.number(),
  tokensOutput: z.number(),
  tokensCacheRead: z.number(),
  tokensCacheCreate: z.number(),
  tokensReasoning: z.number(),
  tokensTotal: z.number(),

  costInputMicrocents: z.number(),
  costOutputMicrocents: z.number(),
  costTotalMicrocents: z.number(),

  userId: externalUserIdSchema,
  simulationId: z.union([z.literal(""), simulationIdSchema]), // optional simulation CUID link, empty string when absent
  tags: z.array(z.string()).readonly(),
  metadata: z.record(z.string(), z.string()).readonly(),
  models: z.array(z.string()).readonly(),
  providers: z.array(z.string()).readonly(),
  serviceNames: z.array(z.string()).readonly(),

  rootSpanId: z.union([z.literal(""), spanIdSchema]), // root of the session's first trace, empty string when no root span has been ingested
  rootSpanName: z.string(),
})

export type Session = z.infer<typeof sessionSchema>

const genAIMessageSchema = z.custom<GenAIMessage>((v) => v !== null && typeof v === "object")
const genAISystemSchema = z.custom<GenAISystem>((v) => v !== null && typeof v === "object")

/**
 * SessionDetail — the point-lookup shape returned by single-session queries.
 *
 * Parallels `TraceDetail`: extends `Session` with the earliest non-empty input,
 * the last responsive span's input + output, and the session's opening system
 * instructions. Big ZSTD-compressed JSON payloads are kept off the list path.
 */
export const sessionDetailSchema = sessionSchema.extend({
  systemInstructions: genAISystemSchema,
  inputMessages: z.array(genAIMessageSchema).readonly(),
  lastInputMessages: z.array(genAIMessageSchema).readonly(),
  outputMessages: z.array(genAIMessageSchema).readonly(),
})

export type SessionDetail = z.infer<typeof sessionDetailSchema>
