import type { ModelConfig, ToolConfig } from "@domain/shared/seeding"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SpanRow = {
  organization_id: string
  project_id: string
  session_id: string
  user_id: string
  trace_id: string
  span_id: string
  parent_span_id: string
  api_key_id: string
  simulation_id: string
  start_time: string
  end_time: string
  name: string
  service_name: string
  kind: number
  status_code: number
  status_message: string
  error_type: string
  tags: string[]
  metadata: Record<string, string>
  operation: string
  provider: string
  model: string
  response_model: string
  tokens_input: number
  tokens_output: number
  tokens_cache_read: number
  tokens_cache_create: number
  tokens_reasoning: number
  cost_input_microcents: number
  cost_output_microcents: number
  cost_total_microcents: number
  cost_is_estimated: number
  time_to_first_token_ns: number
  is_streaming: number
  response_id: string
  finish_reasons: string[]
  input_messages: string
  output_messages: string
  system_instructions: string
  tool_definitions: string
  tool_call_id: string
  tool_name: string
  tool_input: string
  tool_output: string
  attr_string: Record<string, string>
  attr_int: Record<string, number>
  attr_float: Record<string, number>
  attr_bool: Record<string, number>
  resource_string: Record<string, string>
  scope_name: string
  scope_version: string
}

type SpanBase = {
  traceId: string
  parentSpanId: string
  startTime: Date
  durationMs: number
  serviceName: string
  sessionId: string
  userId: string
  organizationId: string
  projectId: string
  apiKeyId: string
  simulationId: string
  tags: string[]
  metadata: Record<string, string>
}

export type TraceConfig = {
  readonly traceCount: number
  readonly timeWindow: { readonly from: Date; readonly to: Date }
  readonly organizationId: string
  readonly projectId: string
  readonly apiKeyId: string
  readonly simulationId?: string
}

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

export function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

export function randomHex(length: number): string {
  const chars = "0123456789abcdef"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)]
  }
  return result
}

function randomResponseId(provider: string): string {
  switch (provider) {
    case "anthropic":
      return `msg_${randomHex(24)}`
    case "openai":
      return `chatcmpl-${randomHex(24)}`
    default:
      return `resp-${randomHex(16)}`
  }
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export function formatClickhouseTime(date: Date): string {
  const iso = date.toISOString()
  return iso.replace("T", " ").replace("Z", "000")
}

export function parseClickhouseTime(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`)
}

export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms)
}

export function clampSpansToWindowEnd(spans: readonly SpanRow[], windowEnd: Date): SpanRow[] {
  const windowEndMs = windowEnd.getTime()

  return spans.map((span) => {
    const start = parseClickhouseTime(span.start_time)
    const end = parseClickhouseTime(span.end_time)

    if (start.getTime() <= windowEndMs && end.getTime() <= windowEndMs) {
      return span
    }

    const clampedStart = start.getTime() > windowEndMs ? new Date(windowEndMs) : start
    const clampedEnd = end.getTime() > windowEndMs ? new Date(windowEndMs) : end
    const normalizedEnd = clampedEnd.getTime() < clampedStart.getTime() ? clampedStart : clampedEnd

    return {
      ...span,
      start_time: formatClickhouseTime(clampedStart),
      end_time: formatClickhouseTime(normalizedEnd),
    }
  })
}

export function randomTimeInWindow(from: Date, to: Date): Date {
  const range = to.getTime() - from.getTime()
  const candidate = new Date(from.getTime() + Math.random() * range)
  const hour = candidate.getUTCHours()
  const day = candidate.getUTCDay()
  const isBusinessHours = hour >= 8 && hour <= 18 && day >= 1 && day <= 5
  if (isBusinessHours || Math.random() < 0.3) return candidate
  const retry = new Date(from.getTime() + Math.random() * range)
  return retry
}

// ---------------------------------------------------------------------------
// Token & cost estimation
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.max(10, Math.ceil(text.length / 4))
}

function computeCost(tokens: number, costPerMToken: number): number {
  return Math.round((tokens / 1_000_000) * costPerMToken * 100_000_000)
}

// ---------------------------------------------------------------------------
// Message builders (OTEL GenAI format)
// ---------------------------------------------------------------------------

type Part = { type: string; [key: string]: unknown }
export type Message = { role: string; parts: Part[] }

export function userMessage(content: string): Message {
  return { role: "user", parts: [{ type: "text", content }] }
}

export function systemMessage(content: string): Message {
  return { role: "system", parts: [{ type: "text", content }] }
}

export function assistantTextMessage(content: string): Message {
  return { role: "assistant", parts: [{ type: "text", content }] }
}

export function assistantToolCallMessage(
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[],
): Message {
  return {
    role: "assistant",
    parts: toolCalls.map((tc) => ({
      type: "tool_call",
      id: tc.id,
      name: tc.name,
      arguments: tc.args,
    })),
  }
}

export function toolResultMessage(callId: string, result: unknown): Message {
  return {
    role: "tool",
    parts: [{ type: "tool_call_response", id: callId, response: JSON.stringify(result) }],
  }
}

// ---------------------------------------------------------------------------
// Span builders
// ---------------------------------------------------------------------------

function makeBaseSpan(base: SpanBase): SpanRow {
  return {
    organization_id: base.organizationId,
    project_id: base.projectId,
    session_id: base.sessionId,
    user_id: base.userId,
    trace_id: base.traceId,
    span_id: randomHex(16),
    parent_span_id: base.parentSpanId,
    api_key_id: base.apiKeyId,
    simulation_id: base.simulationId,
    start_time: formatClickhouseTime(base.startTime),
    end_time: formatClickhouseTime(addMs(base.startTime, base.durationMs)),
    name: "",
    service_name: base.serviceName,
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: base.tags,
    metadata: base.metadata,
    operation: "unspecified",
    provider: "",
    model: "",
    response_model: "",
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: "",
    output_messages: "",
    system_instructions: "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: { "service.name": base.serviceName },
    scope_name: "",
    scope_version: "",
  }
}

function toolToDefinition(tool: ToolConfig) {
  return { name: tool.name, description: tool.description, parameters: tool.parameters }
}

export function makeLlmSpan({
  base,
  modelConfig,
  inputMessages,
  outputMessages,
  systemInstructions,
  toolDefinitions,
  finishReason,
  temperature,
}: {
  base: SpanBase
  modelConfig: ModelConfig
  inputMessages: Message[]
  outputMessages: Message[]
  systemInstructions?: string
  toolDefinitions?: ToolConfig[]
  finishReason: string
  temperature?: number
}): SpanRow {
  const span = makeBaseSpan(base)
  const inputTokens = estimateTokens(JSON.stringify(inputMessages))
  const outputTokens = estimateTokens(JSON.stringify(outputMessages))
  const cacheRead = Math.random() > 0.6 ? Math.floor(inputTokens * randFloat(0.2, 0.6)) : 0
  const reasoningTokens = modelConfig.isReasoning ? Math.floor(outputTokens * randFloat(1.5, 4)) : 0
  const costIn = computeCost(inputTokens, modelConfig.costInPerMToken)
  const costOut = computeCost(outputTokens + reasoningTokens, modelConfig.costOutPerMToken)

  span.name = `chat ${modelConfig.model}`
  span.operation = "chat"
  span.provider = modelConfig.provider
  span.model = modelConfig.model
  span.response_model = modelConfig.responseModel
  span.tokens_input = inputTokens
  span.tokens_output = outputTokens
  span.tokens_cache_read = cacheRead
  span.tokens_reasoning = reasoningTokens
  span.cost_input_microcents = costIn
  span.cost_output_microcents = costOut
  span.cost_total_microcents = costIn + costOut
  span.cost_is_estimated = 1
  span.response_id = randomResponseId(modelConfig.provider)
  span.finish_reasons = [finishReason]
  span.input_messages = JSON.stringify(inputMessages)
  span.output_messages = JSON.stringify(outputMessages)
  span.system_instructions = systemInstructions ? JSON.stringify([{ type: "text", content: systemInstructions }]) : ""
  span.tool_definitions = toolDefinitions ? JSON.stringify(toolDefinitions.map(toolToDefinition)) : ""
  span.scope_name = modelConfig.scopeName
  span.scope_version = "1.0.0"
  if (temperature !== undefined) {
    span.attr_float = { "gen_ai.request.temperature": temperature }
  }

  const isStreaming = Math.random() > 0.4
  if (isStreaming && outputTokens > 0) {
    span.is_streaming = 1
    const durationNs = base.durationMs * 1_000_000
    span.time_to_first_token_ns = Math.floor(durationNs * randFloat(0.05, 0.3))
  }

  return span
}

export function makeToolSpan({ base, tool, callId }: { base: SpanBase; tool: ToolConfig; callId: string }): SpanRow {
  const span = makeBaseSpan(base)
  span.name = `execute_tool ${tool.name}`
  span.operation = "execute_tool"
  span.kind = 2
  span.tool_call_id = callId
  span.tool_name = tool.name
  span.tool_input = JSON.stringify(tool.sampleArgs)
  span.tool_output = JSON.stringify(tool.sampleResult)
  span.attr_string = {
    "gen_ai.tool.name": tool.name,
    "gen_ai.tool.call.id": callId,
    "gen_ai.tool.type": "function",
  }
  return span
}

export function makeEmbeddingSpan({
  base,
  modelConfig,
  inputTokens,
}: {
  base: SpanBase
  modelConfig: ModelConfig
  inputTokens: number
}): SpanRow {
  const span = makeBaseSpan(base)
  const costIn = computeCost(inputTokens, modelConfig.costInPerMToken)

  span.name = `embeddings ${modelConfig.model}`
  span.operation = "embeddings"
  span.provider = modelConfig.provider
  span.model = modelConfig.model
  span.response_model = modelConfig.responseModel
  span.tokens_input = inputTokens
  span.cost_input_microcents = costIn
  span.cost_total_microcents = costIn
  span.cost_is_estimated = 1
  span.scope_name = modelConfig.scopeName
  span.scope_version = "1.0.0"
  return span
}

export function makeRetrievalSpan({ base }: { base: SpanBase }): SpanRow {
  const span = makeBaseSpan(base)
  span.name = "retrieval vector-store"
  span.operation = "retrieval"
  span.attr_int = { "gen_ai.retrieval.documents.count": randInt(2, 10) }
  return span
}

export function makeWrapperSpan({ base, name }: { base: SpanBase; name: string }): SpanRow {
  const span = makeBaseSpan(base)
  span.name = name
  span.kind = 2
  return span
}

// ---------------------------------------------------------------------------
// Trace context
// ---------------------------------------------------------------------------

export type TraceContext = {
  organizationId: string
  projectId: string
  apiKeyId: string
  simulationId: string
  startTime: Date
  sessionId: string
  userId: string
  serviceName: string
  tags: string[]
  metadata: Record<string, string>
}

export function toBase(
  ctx: TraceContext,
  traceId: string,
  parentSpanId: string,
  startTime: Date,
  durationMs: number,
): SpanBase {
  return {
    traceId,
    parentSpanId,
    startTime,
    durationMs,
    serviceName: ctx.serviceName,
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    apiKeyId: ctx.apiKeyId,
    simulationId: ctx.simulationId,
    tags: ctx.tags,
    metadata: ctx.metadata,
  }
}

/**
 * Picks a weighted random item from a distribution.
 * Each entry has a `weight` field; the probability is weight / totalWeight.
 */
export function pickByWeight<T extends { weight: number }>(items: readonly T[]): T {
  const totalWeight = items.reduce((sum, it) => sum + it.weight, 0)
  let r = Math.random() * totalWeight
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item
  }
  return items[items.length - 1] as T
}
