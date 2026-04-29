import {
  externalUserIdSchema,
  organizationIdSchema,
  projectIdSchema,
  sessionIdSchema,
  simulationIdSchema,
  spanIdSchema,
  traceIdSchema,
} from "@domain/shared"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { z } from "zod"

/**
 * Trace — the listing shape returned by project-scoped queries.
 *
 * Aggregated from spans via a ClickHouse materialized view.
 * Excludes large LLM content payloads to keep list queries fast.
 */
export const traceSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  traceId: traceIdSchema,

  spanCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),

  startTime: z.date(),
  endTime: z.date(),
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

  sessionId: sessionIdSchema,
  userId: externalUserIdSchema,
  simulationId: z.union([z.literal(""), simulationIdSchema]), // optional simulation CUID link, empty string when absent
  tags: z.array(z.string()).readonly(),
  metadata: z.record(z.string(), z.string()).readonly(),
  models: z.array(z.string()).readonly(),
  providers: z.array(z.string()).readonly(),
  serviceNames: z.array(z.string()).readonly(),

  rootSpanId: z.union([z.literal(""), spanIdSchema]), // root span id, empty string when no root span has been ingested
  rootSpanName: z.string(),
})

export type Trace = z.infer<typeof traceSchema>

const genAIMessageSchema = z.custom<GenAIMessage>((v) => v !== null && typeof v === "object")
const genAISystemSchema = z.custom<GenAISystem>((v) => v !== null && typeof v === "object")

/**
 * TraceDetail — the point-lookup shape returned by single-trace queries.
 *
 * Extends Trace with the first input messages, last output messages,
 * and an `allMessages` array that concatenates the last span's input
 * with the last output for a full conversation view.
 */
export const traceDetailSchema = traceSchema.extend({
  systemInstructions: genAISystemSchema,
  inputMessages: z.array(genAIMessageSchema).readonly(),
  outputMessages: z.array(genAIMessageSchema).readonly(),
  allMessages: z.array(genAIMessageSchema).readonly(),
})

export type TraceDetail = z.infer<typeof traceDetailSchema>
