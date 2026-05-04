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

export const spanKindSchema = z.enum(["unspecified", "internal", "server", "client", "producer", "consumer"])
export type SpanKind = z.infer<typeof spanKindSchema>

export const spanStatusCodeSchema = z.enum(["unset", "ok", "error"])
export type SpanStatusCode = z.infer<typeof spanStatusCodeSchema>

export const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.unknown(),
})

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>

export const operationSchema = z.union([
  z.enum([
    "chat",
    "text_completion",
    "embeddings",
    "execute_tool",
    "invoke_agent",
    "reranker",
    "chain",
    "prompt",
    "retrieval",
    "guardrail",
    "evaluator",
    "unspecified",
  ]),
  z.string(),
])
export type Operation = z.infer<typeof operationSchema>

/**
 * Span — the listing/query shape returned by list and trace queries.
 *
 * Excludes the large LLM content payloads (input_messages, output_messages,
 * system_instructions, tool_definitions) to keep list queries fast.
 */
export const spanSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  userId: externalUserIdSchema,
  traceId: traceIdSchema,
  spanId: spanIdSchema,
  parentSpanId: z.string(),
  apiKeyId: z.string(),
  simulationId: z.union([z.literal(""), simulationIdSchema]), // optional simulation CUID link, empty string when absent
  startTime: z.date(),
  endTime: z.date(),
  name: z.string(),
  serviceName: z.string(),
  kind: spanKindSchema,
  statusCode: spanStatusCodeSchema,
  statusMessage: z.string(),
  traceFlags: z.number(),
  traceState: z.string(),
  errorType: z.string(),
  tags: z.array(z.string()).readonly(),
  metadata: z.record(z.string(), z.string()).readonly(),
  eventsJson: z.string(),
  linksJson: z.string(),
  operation: operationSchema,
  provider: z.string(),
  model: z.string(),
  responseModel: z.string(),
  tokensInput: z.number(),
  tokensOutput: z.number(),
  tokensCacheRead: z.number(),
  tokensCacheCreate: z.number(),
  tokensReasoning: z.number(),
  costInputMicrocents: z.number(),
  costOutputMicrocents: z.number(),
  costTotalMicrocents: z.number(),
  costIsEstimated: z.boolean(),
  timeToFirstTokenNs: z.number(),
  isStreaming: z.boolean(),
  responseId: z.string(),
  finishReasons: z.array(z.string()).readonly(),
  attrString: z.record(z.string(), z.string()).readonly(),
  attrInt: z.record(z.string(), z.number()).readonly(),
  attrFloat: z.record(z.string(), z.number()).readonly(),
  attrBool: z.record(z.string(), z.boolean()).readonly(),
  resourceString: z.record(z.string(), z.string()).readonly(),
  scopeName: z.string(),
  scopeVersion: z.string(),
  retentionDays: z.number().int().positive().optional(),
  ingestedAt: z.date(),
})

export type Span = z.infer<typeof spanSchema>

const genAIMessageSchema = z.custom<GenAIMessage>((v) => v !== null && typeof v === "object")
const genAISystemSchema = z.custom<GenAISystem>((v) => v !== null && typeof v === "object")

/**
 * SpanDetail — the point-lookup shape returned by single-span queries.
 *
 * Extends Span with parsed LLM content payloads.
 */
export const spanDetailSchema = spanSchema.extend({
  inputMessages: z.array(genAIMessageSchema).readonly(),
  outputMessages: z.array(genAIMessageSchema).readonly(),
  systemInstructions: genAISystemSchema,
  toolDefinitions: z.array(toolDefinitionSchema).readonly(),
  toolCallId: z.string(),
  toolName: z.string(),
  toolInput: z.string(),
  toolOutput: z.string(),
})

export type SpanDetail = z.infer<typeof spanDetailSchema>
