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

/**
 * Where a span's cost came from, so a stored 0 can be read.
 *
 * - `provider_reported` — the instrumentation sent a cost, authoritative.
 * - `estimated` — we priced the tokens off models.dev.
 * - `unpriced` — tokens were reported but no models.dev pricing matched, so cost stayed 0. A 0 here
 *   understates the real spend; it is not free.
 * - `no_tokens` — no usage to price, so 0 is the whole truth.
 * - `unknown` — ingested before the column existed. Never written by ingestion: spans stored before
 *   the split cannot say whether a 0 was free or unpriced, so they must not be read as either.
 *
 * `provider_reported` and `estimated` at 0 mean the call genuinely cost nothing.
 */
export const costSourceSchema = z.enum(["provider_reported", "estimated", "unpriced", "no_tokens", "unknown"])
export type CostSource = z.infer<typeof costSourceSchema>

const COST_SOURCE_SET: ReadonlySet<string> = new Set(costSourceSchema.options)

/** The cost columns a pre-`cost_source` span row still carries, enough to partly reclassify it. */
export interface StoredCostSignals {
  readonly costTotalMicrocents: number
  readonly costIsEstimated: boolean
  readonly hasTokens: boolean
}

/**
 * Read a stored `cost_source`. Rows written before the column existed come back as the empty string;
 * a non-zero cost still says which side it came from, but a zero cost with tokens cannot say whether
 * it was free or unpriced, so it stays `unknown` rather than being guessed either way.
 */
export function parseCostSource(value: string, stored: StoredCostSignals): CostSource {
  if (COST_SOURCE_SET.has(value)) return value as CostSource
  if (stored.costTotalMicrocents > 0) return stored.costIsEstimated ? "estimated" : "provider_reported"
  return stored.hasTokens ? "unknown" : "no_tokens"
}

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
    "generate_content",
    "embeddings",
    "execute_tool",
    "invoke_agent",
    "agent_step",
    "create_agent",
    "invoke_workflow",
    "plan",
    "reranker",
    "chain",
    "prompt",
    "retrieval",
    "guardrail",
    "evaluator",
    "create_memory",
    "update_memory",
    "upsert_memory",
    "delete_memory",
    "search_memory",
    "create_memory_store",
    "delete_memory_store",
    "unspecified",
  ]),
  z.string(),
])
export type Operation = z.infer<typeof operationSchema>

export const MEMORY_OPERATIONS = [
  "create_memory",
  "update_memory",
  "upsert_memory",
  "delete_memory",
  "search_memory",
  "create_memory_store",
  "delete_memory_store",
] as const satisfies readonly Operation[]

const MEMORY_OPERATIONS_SET: ReadonlySet<string> = new Set(MEMORY_OPERATIONS)

export function isMemoryOperation(operation: string): boolean {
  return MEMORY_OPERATIONS_SET.has(operation)
}

/**
 * Operations whose token/cost usage counts as spend. The rollups (`traces_mv`/`sessions_mv`) and
 * every cost query gate on this list so wrapper spans never double-count; `USAGE_OPERATIONS_SQL`
 * is generated from it, so the SQL and the TypeScript cannot drift.
 */
export const USAGE_OPERATIONS = [
  "chat",
  "text_completion",
  "generate_content",
  "embeddings",
  "reranker",
] as const satisfies readonly Operation[]

const USAGE_OPERATIONS_SET: ReadonlySet<string> = new Set(USAGE_OPERATIONS)

export function isUsageOperation(operation: string): boolean {
  return USAGE_OPERATIONS_SET.has(operation)
}

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
  userEmail: z.string(),
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
  toolName: z.string(),
  agentName: z.string(),
  toolNames: z.array(z.string()).readonly(),
  toolCallId: z.string(),
  tokensInput: z.number(),
  tokensOutput: z.number(),
  tokensCacheRead: z.number(),
  tokensCacheCreate: z.number(),
  tokensReasoning: z.number(),
  costInputMicrocents: z.number(),
  costOutputMicrocents: z.number(),
  costTotalMicrocents: z.number(),
  costIsEstimated: z.boolean(),
  costSource: costSourceSchema,
  /**
   * Catalog provider an estimate was priced from. Often not the reported provider: a gateway names
   * itself and carries the vendor in the model slug.
   *
   * Empty on anything we did not price, and also on every row stored before the column existed — so
   * an `estimated` span with this empty is historical, not a contradiction. Readers must treat empty
   * as "not recorded" rather than inferring it from `costSource`.
   */
  costPricedProvider: z.string(),
  /**
   * Catalog model id an estimate was priced from. May be a base entry of the reported model, since a
   * dated id resolves to the entry it versions. Empty under the same conditions as
   * `costPricedProvider`.
   */
  costPricedModel: z.string(),
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
  toolInput: z.string(),
  toolOutput: z.string(),
})

export type SpanDetail = z.infer<typeof spanDetailSchema>
