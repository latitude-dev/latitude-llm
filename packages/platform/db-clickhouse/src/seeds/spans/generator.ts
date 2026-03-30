import {
  ASSISTANT_RESPONSES,
  EMBEDDING_MODELS,
  ERROR_TYPES,
  MODELS,
  type ModelConfig,
  SERVICE_NAMES,
  SESSION_FOLLOWUPS,
  SYSTEM_PROMPTS,
  TOOLS,
  type ToolConfig,
  USER_IDS,
  USER_PROMPTS,
} from "./pools.ts"

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

export type TraceConfig = {
  readonly traceCount: number
  readonly timeWindow: { readonly from: Date; readonly to: Date }
  readonly organizationId: string
  readonly projectId: string
  readonly apiKeyId: string
}

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

function randomHex(length: number): string {
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

function formatClickhouseTime(date: Date): string {
  const iso = date.toISOString()
  return iso.replace("T", " ").replace("Z", "000")
}

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms)
}

function randomTimeInWindow(from: Date, to: Date): Date {
  const range = to.getTime() - from.getTime()
  // Weight toward business hours (8am-6pm UTC) on weekdays
  const candidate = new Date(from.getTime() + Math.random() * range)
  const hour = candidate.getUTCHours()
  const day = candidate.getUTCDay()
  const isBusinessHours = hour >= 8 && hour <= 18 && day >= 1 && day <= 5
  if (isBusinessHours || Math.random() < 0.3) return candidate
  // Retry once for business-hour bias
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
type Message = { role: string; parts: Part[] }

function userMessage(content: string): Message {
  return { role: "user", parts: [{ type: "text", content }] }
}

function systemMessage(content: string): Message {
  return { role: "system", parts: [{ type: "text", content }] }
}

function assistantTextMessage(content: string): Message {
  return { role: "assistant", parts: [{ type: "text", content }] }
}

function assistantToolCallMessage(toolCalls: { id: string; name: string; args: Record<string, unknown> }[]): Message {
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

function toolResultMessage(callId: string, result: unknown): Message {
  return {
    role: "tool",
    parts: [{ type: "tool_call_response", id: callId, response: JSON.stringify(result) }],
  }
}

// ---------------------------------------------------------------------------
// Span builders
// ---------------------------------------------------------------------------

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
  tags: string[]
  metadata: Record<string, string>
}

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

function makeLlmSpan({
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

function makeToolSpan({ base, tool, callId }: { base: SpanBase; tool: ToolConfig; callId: string }): SpanRow {
  const span = makeBaseSpan(base)
  span.name = `execute_tool ${tool.name}`
  span.operation = "execute_tool"
  span.kind = 2 // INTERNAL
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

function makeEmbeddingSpan({
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

function makeRetrievalSpan({ base }: { base: SpanBase }): SpanRow {
  const span = makeBaseSpan(base)
  span.name = "retrieval vector-store"
  span.operation = "retrieval"
  span.attr_int = { "gen_ai.retrieval.documents.count": randInt(2, 10) }
  return span
}

function makeWrapperSpan({ base, name }: { base: SpanBase; name: string }): SpanRow {
  const span = makeBaseSpan(base)
  span.name = name
  span.kind = 2 // INTERNAL
  return span
}

function toolToDefinition(tool: ToolConfig) {
  return { name: tool.name, description: tool.description, parameters: tool.parameters }
}

// ---------------------------------------------------------------------------
// Trace pattern generators
// ---------------------------------------------------------------------------

type TraceContext = {
  organizationId: string
  projectId: string
  apiKeyId: string
  startTime: Date
  sessionId: string
  userId: string
  serviceName: string
  tags: string[]
  metadata: Record<string, string>
}

function generateTraceMetadata(): Record<string, string> {
  if (Math.random() < 0.25) return {}

  const meta: Record<string, string> = {}

  meta.environment = pick(["production", "staging", "development", "preview"])
  meta.sdk_version = pick(["1.2.0", "1.3.1", "1.4.0-beta.2", "2.0.0"])

  if (Math.random() > 0.3) {
    meta.app_version = pick(["3.12.0", "3.12.1", "3.13.0-rc.1", "3.11.4"])
  }
  if (Math.random() > 0.5) {
    meta.feature_flag = pick(["new-checkout-v2", "dark-mode", "ai-summary", "premium-tier", "beta-search"])
  }
  if (Math.random() > 0.6) {
    meta.tenant = pick(["acme-corp", "globex", "initech", "hooli", "piedpiper", "umbrella"])
  }
  if (Math.random() > 0.7) {
    meta.region = pick(["us-east-1", "eu-west-1", "ap-southeast-1", "us-west-2"])
  }
  if (Math.random() > 0.8) {
    meta.request_source = pick(["web", "mobile-ios", "mobile-android", "api", "slack-bot", "cli"])
  }

  return meta
}

function newTraceCtx(config: TraceConfig): TraceContext {
  return {
    organizationId: config.organizationId,
    projectId: config.projectId,
    apiKeyId: config.apiKeyId,
    startTime: randomTimeInWindow(config.timeWindow.from, config.timeWindow.to),
    sessionId: "",
    userId: Math.random() > 0.4 ? pick(USER_IDS) : "",
    serviceName: pick(SERVICE_NAMES),
    tags:
      Math.random() > 0.6
        ? pickN(["production", "staging", "canary", "experiment-a", "experiment-b"], randInt(1, 2))
        : [],
    metadata: generateTraceMetadata(),
  }
}

function toBase(
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
    tags: ctx.tags,
    metadata: ctx.metadata,
  }
}

// Pattern 1: Simple chat completion (1 span)
function generateSimpleChat(config: TraceConfig): SpanRow[] {
  const ctx = newTraceCtx(config)
  const traceId = randomHex(32)
  const modelConfig = pick(MODELS)
  const duration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
  const userPrompt = pick(USER_PROMPTS)
  const assistantReply = pick(ASSISTANT_RESPONSES)
  const temperature = randFloat(0, 1)

  const systemInstructions = Math.random() > 0.4 ? pick(SYSTEM_PROMPTS) : undefined
  const span = makeLlmSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, duration),
    modelConfig,
    inputMessages: [userMessage(userPrompt)],
    outputMessages: [assistantTextMessage(assistantReply)],
    ...(systemInstructions !== undefined && { systemInstructions }),
    finishReason: modelConfig.finishReasonStop,
    temperature: Math.round(temperature * 10) / 10,
  })
  return [span]
}

// Pattern 2: Chat with a single round of tool calls (3-4 spans)
function generateToolCallTrace(config: TraceConfig): SpanRow[] {
  const ctx = newTraceCtx(config)
  const traceId = randomHex(32)
  const modelConfig = pick(MODELS)
  const tools = pickN(TOOLS, randInt(1, 3))
  const spans: SpanRow[] = []
  let cursor = ctx.startTime
  const rootSpanId = randomHex(16)
  const userPrompt = pick(USER_PROMPTS)
  const systemPrompt = Math.random() > 0.3 ? pick(SYSTEM_PROMPTS) : undefined

  const conversationHistory: Message[] = [userMessage(userPrompt)]

  // First LLM call -> responds with tool_calls
  const llm1Duration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
  const toolCalls = tools.map((t) => ({
    id: `call_${randomHex(24)}`,
    name: t.name,
    args: t.sampleArgs,
  }))
  const llm1Output = [assistantToolCallMessage(toolCalls)]

  const llm1 = makeLlmSpan({
    base: toBase(ctx, traceId, rootSpanId, cursor, llm1Duration),
    modelConfig,
    inputMessages: conversationHistory,
    outputMessages: llm1Output,
    ...(systemPrompt !== undefined && { systemInstructions: systemPrompt }),
    toolDefinitions: tools,
    finishReason: "tool_calls",
  })
  spans.push(llm1)
  cursor = addMs(cursor, llm1Duration)

  // Add assistant tool call to history
  conversationHistory.push(assistantToolCallMessage(toolCalls))

  // Tool execution spans + tool results in history
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i] as ToolConfig
    const callId = (toolCalls[i] as { id: string }).id
    const toolDuration = randInt(tool.latencyRange[0], tool.latencyRange[1])
    const toolSpan = makeToolSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, toolDuration),
      tool,
      callId,
    })
    spans.push(toolSpan)
    conversationHistory.push(toolResultMessage(callId, tool.sampleResult))
    cursor = addMs(cursor, toolDuration)
  }

  // Second LLM call -> final response
  const llm2Duration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
  const llm2 = makeLlmSpan({
    base: toBase(ctx, traceId, rootSpanId, cursor, llm2Duration),
    modelConfig,
    inputMessages: conversationHistory,
    outputMessages: [assistantTextMessage(pick(ASSISTANT_RESPONSES))],
    ...(systemPrompt !== undefined && { systemInstructions: systemPrompt }),
    toolDefinitions: tools,
    finishReason: modelConfig.finishReasonStop,
  })
  spans.push(llm2)
  cursor = addMs(cursor, llm2Duration)

  // Root wrapper span
  const totalDuration = cursor.getTime() - ctx.startTime.getTime() + randInt(10, 50)
  const root = makeWrapperSpan({
    base: { ...toBase(ctx, traceId, "", ctx.startTime, totalDuration), durationMs: totalDuration },
    name: `invoke_agent ${ctx.serviceName}`,
  })
  root.span_id = rootSpanId
  root.operation = "invoke_agent"
  spans.unshift(root)

  return spans
}

// Pattern 3: RAG pipeline (3-5 spans)
function generateRagTrace(config: TraceConfig): SpanRow[] {
  const ctx = newTraceCtx(config)
  const traceId = randomHex(32)
  const rootSpanId = randomHex(16)
  const spans: SpanRow[] = []
  let cursor = ctx.startTime

  const embeddingModel = pick(EMBEDDING_MODELS)
  const chatModel = pick(MODELS)
  const userPrompt = pick(USER_PROMPTS)
  const inputTokens = randInt(50, 300)

  // Embedding span
  const embDuration = randInt(embeddingModel.latencyRange[0], embeddingModel.latencyRange[1])
  spans.push(
    makeEmbeddingSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, embDuration),
      modelConfig: embeddingModel,
      inputTokens,
    }),
  )
  cursor = addMs(cursor, embDuration)

  // Retrieval span
  const retDuration = randInt(80, 500)
  spans.push(
    makeRetrievalSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, retDuration),
    }),
  )
  cursor = addMs(cursor, retDuration)

  // Chat completion with retrieved context
  const chatDuration = randInt(chatModel.latencyRange[0], chatModel.latencyRange[1])
  spans.push(
    makeLlmSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, chatDuration),
      modelConfig: chatModel,
      inputMessages: [
        userMessage(userPrompt),
        systemMessage("[Retrieved context: Document 1: ... Document 2: ... Document 3: ...]"),
      ],
      outputMessages: [assistantTextMessage(pick(ASSISTANT_RESPONSES))],
      finishReason: chatModel.finishReasonStop,
    }),
  )
  cursor = addMs(cursor, chatDuration)

  // Root wrapper
  const totalDuration = cursor.getTime() - ctx.startTime.getTime() + randInt(10, 30)
  const root = makeWrapperSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, totalDuration),
    name: "rag-pipeline",
  })
  root.span_id = rootSpanId
  spans.unshift(root)

  return spans
}

// Pattern 4 & 5: Multi-step agent (5-25 spans, recursive tool calls possible)
function generateAgentTrace(
  config: TraceConfig,
  { maxSteps, allowNesting }: { maxSteps: number; allowNesting: boolean },
): SpanRow[] {
  const ctx = newTraceCtx(config)
  const traceId = randomHex(32)
  const rootSpanId = randomHex(16)
  const spans: SpanRow[] = []
  let cursor = ctx.startTime

  const modelConfig = pick(MODELS)
  const availableTools = pickN(TOOLS, randInt(2, 5))
  const systemPrompt = pick(SYSTEM_PROMPTS)
  const userPrompt = pick(USER_PROMPTS)
  const conversationHistory: Message[] = [userMessage(userPrompt)]
  const toolCallSteps = randInt(1, maxSteps)

  for (let step = 0; step <= toolCallSteps; step++) {
    const isLastStep = step === toolCallSteps
    const finishReason = isLastStep ? modelConfig.finishReasonStop : "tool_calls"
    const toolsThisStep = isLastStep ? [] : pickN(availableTools, randInt(1, 3))

    // LLM inference span
    const llmDuration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
    const toolCalls = toolsThisStep.map((t) => ({
      id: `call_${randomHex(24)}`,
      name: t.name,
      args: t.sampleArgs,
    }))

    const outputMessages = isLastStep
      ? [assistantTextMessage(pick(ASSISTANT_RESPONSES))]
      : [assistantToolCallMessage(toolCalls)]

    const llmSpan = makeLlmSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, llmDuration),
      modelConfig,
      inputMessages: [...conversationHistory],
      outputMessages,
      systemInstructions: systemPrompt,
      toolDefinitions: availableTools,
      finishReason,
      temperature: Math.round(randFloat(0, 1) * 10) / 10,
    })
    spans.push(llmSpan)
    cursor = addMs(cursor, llmDuration)

    if (!isLastStep) {
      conversationHistory.push(assistantToolCallMessage(toolCalls))
    }

    // Tool execution spans
    for (let i = 0; i < toolsThisStep.length; i++) {
      const tool = toolsThisStep[i] as ToolConfig
      const callId = (toolCalls[i] as { id: string }).id
      const toolDuration = randInt(tool.latencyRange[0], tool.latencyRange[1])
      const toolSpan = makeToolSpan({
        base: toBase(ctx, traceId, rootSpanId, cursor, toolDuration),
        tool,
        callId,
      })

      // Nested LLM call inside tool execution (complex agents only)
      if (allowNesting && Math.random() < 0.25) {
        const nestedModel = pick(MODELS.filter((m) => m.latencyRange[0] < 1000))
        const nestedDuration = randInt(nestedModel.latencyRange[0], nestedModel.latencyRange[1])
        const nestedStart = addMs(cursor, Math.floor(toolDuration * 0.1))

        // Expand tool span to fit nested LLM
        const expandedToolDuration = Math.max(toolDuration, nestedDuration + Math.floor(toolDuration * 0.2))
        toolSpan.end_time = formatClickhouseTime(addMs(cursor, expandedToolDuration))

        const nestedSpan = makeLlmSpan({
          base: toBase(ctx, traceId, toolSpan.span_id, nestedStart, nestedDuration),
          modelConfig: nestedModel,
          inputMessages: [userMessage(`Analyze the output of ${tool.name}: ${JSON.stringify(tool.sampleResult)}`)],
          outputMessages: [assistantTextMessage("Based on the tool output, here is my analysis...")],
          finishReason: nestedModel.finishReasonStop,
        })
        spans.push(nestedSpan)
        spans.push(toolSpan)
        cursor = addMs(cursor, expandedToolDuration)
      } else {
        spans.push(toolSpan)
        cursor = addMs(cursor, toolDuration)
      }

      conversationHistory.push(toolResultMessage(callId, tool.sampleResult))
    }
  }

  // Root agent span
  const totalDuration = cursor.getTime() - ctx.startTime.getTime() + randInt(20, 100)
  const root = makeWrapperSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, totalDuration),
    name: `invoke_agent ${ctx.serviceName}`,
  })
  root.span_id = rootSpanId
  root.operation = "invoke_agent"
  spans.unshift(root)

  return spans
}

// Pattern 6: Error trace (1-2 spans)
function generateErrorTrace(config: TraceConfig): SpanRow[] {
  const ctx = newTraceCtx(config)
  const traceId = randomHex(32)
  const modelConfig = pick(MODELS)
  const error = pick(ERROR_TYPES)
  const duration = randInt(50, modelConfig.latencyRange[0])

  const span = makeLlmSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, duration),
    modelConfig,
    inputMessages: [userMessage(pick(USER_PROMPTS))],
    outputMessages: [],
    finishReason: "",
  })
  span.status_code = 2
  span.status_message = error.message
  span.error_type = error.type
  span.finish_reasons = []
  span.response_id = ""
  span.tokens_input = 0
  span.tokens_output = 0
  span.tokens_cache_read = 0
  span.tokens_reasoning = 0
  span.cost_input_microcents = 0
  span.cost_output_microcents = 0
  span.cost_total_microcents = 0
  span.cost_is_estimated = 0
  return [span]
}

// ---------------------------------------------------------------------------
// Weighted pattern selection
// ---------------------------------------------------------------------------

type TracePattern = "simple_chat" | "tool_call" | "rag" | "multi_step_agent" | "complex_agent" | "error"

const PATTERN_WEIGHTS: readonly { pattern: TracePattern; weight: number }[] = [
  { pattern: "simple_chat", weight: 40 },
  { pattern: "tool_call", weight: 20 },
  { pattern: "rag", weight: 10 },
  { pattern: "multi_step_agent", weight: 15 },
  { pattern: "complex_agent", weight: 10 },
  { pattern: "error", weight: 5 },
]

function pickPattern(): TracePattern {
  const totalWeight = PATTERN_WEIGHTS.reduce((sum, pw) => sum + pw.weight, 0)
  let r = Math.random() * totalWeight
  for (const pw of PATTERN_WEIGHTS) {
    r -= pw.weight
    if (r <= 0) return pw.pattern
  }
  return "simple_chat"
}

function generateTrace(pattern: TracePattern, config: TraceConfig): SpanRow[] {
  switch (pattern) {
    case "simple_chat":
      return generateSimpleChat(config)
    case "tool_call":
      return generateToolCallTrace(config)
    case "rag":
      return generateRagTrace(config)
    case "multi_step_agent":
      return generateAgentTrace(config, { maxSteps: randInt(2, 5), allowNesting: false })
    case "complex_agent":
      return generateAgentTrace(config, { maxSteps: randInt(4, 8), allowNesting: true })
    case "error":
      return generateErrorTrace(config)
  }
}

// ---------------------------------------------------------------------------
// Session trace generation — coherent multi-turn conversations
// ---------------------------------------------------------------------------

type TurnResult = {
  spans: SpanRow[]
  response: string
  durationMs: number
}

type SessionConfig = {
  sessionId: string
  modelConfig: ModelConfig
  systemPrompt: string
  userId: string
  serviceName: string
  tags: string[]
  metadata: Record<string, string>
  availableTools: ToolConfig[]
  includeRag: boolean
}

function pickSessionConfig(): SessionConfig {
  const hasTools = Math.random() > 0.4
  const availableTools = hasTools ? pickN(TOOLS, randInt(2, 5)) : []
  return {
    sessionId: `session-${randomHex(8)}`,
    modelConfig: pick(MODELS),
    systemPrompt: pick(SYSTEM_PROMPTS),
    userId: Math.random() > 0.3 ? pick(USER_IDS) : "",
    serviceName: pick(SERVICE_NAMES),
    tags:
      Math.random() > 0.6
        ? pickN(["production", "staging", "canary", "experiment-a", "experiment-b"], randInt(1, 2))
        : [],
    metadata: generateTraceMetadata(),
    availableTools,
    includeRag: !hasTools && Math.random() < 0.25,
  }
}

function generateSessionChatTurn(
  ctx: TraceContext,
  traceId: string,
  session: SessionConfig,
  inputMessages: Message[],
): TurnResult {
  const duration = randInt(session.modelConfig.latencyRange[0], session.modelConfig.latencyRange[1])
  const assistantReply = pick(ASSISTANT_RESPONSES)
  const temperature = Math.round(randFloat(0, 1) * 10) / 10

  const span = makeLlmSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, duration),
    modelConfig: session.modelConfig,
    inputMessages,
    outputMessages: [assistantTextMessage(assistantReply)],
    systemInstructions: session.systemPrompt,
    ...(session.availableTools.length > 0 && { toolDefinitions: session.availableTools }),
    finishReason: session.modelConfig.finishReasonStop,
    temperature,
  })

  return { spans: [span], response: assistantReply, durationMs: duration }
}

function generateSessionToolCallTurn(
  ctx: TraceContext,
  traceId: string,
  session: SessionConfig,
  inputMessages: Message[],
): TurnResult {
  const spans: SpanRow[] = []
  let cursor = ctx.startTime
  const rootSpanId = randomHex(16)
  const tools = pickN(session.availableTools, randInt(1, 3))

  const llm1Duration = randInt(session.modelConfig.latencyRange[0], session.modelConfig.latencyRange[1])
  const toolCalls = tools.map((t) => ({
    id: `call_${randomHex(24)}`,
    name: t.name,
    args: t.sampleArgs,
  }))

  const llm1 = makeLlmSpan({
    base: toBase(ctx, traceId, rootSpanId, cursor, llm1Duration),
    modelConfig: session.modelConfig,
    inputMessages,
    outputMessages: [assistantToolCallMessage(toolCalls)],
    systemInstructions: session.systemPrompt,
    toolDefinitions: session.availableTools,
    finishReason: "tool_calls",
  })
  spans.push(llm1)
  cursor = addMs(cursor, llm1Duration)

  const internalHistory = [...inputMessages, assistantToolCallMessage(toolCalls)]

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i] as ToolConfig
    const callId = (toolCalls[i] as { id: string }).id
    const toolDuration = randInt(tool.latencyRange[0], tool.latencyRange[1])
    const toolSpan = makeToolSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, toolDuration),
      tool,
      callId,
    })
    spans.push(toolSpan)
    internalHistory.push(toolResultMessage(callId, tool.sampleResult))
    cursor = addMs(cursor, toolDuration)
  }

  const llm2Duration = randInt(session.modelConfig.latencyRange[0], session.modelConfig.latencyRange[1])
  const assistantReply = pick(ASSISTANT_RESPONSES)
  const llm2 = makeLlmSpan({
    base: toBase(ctx, traceId, rootSpanId, cursor, llm2Duration),
    modelConfig: session.modelConfig,
    inputMessages: internalHistory,
    outputMessages: [assistantTextMessage(assistantReply)],
    systemInstructions: session.systemPrompt,
    toolDefinitions: session.availableTools,
    finishReason: session.modelConfig.finishReasonStop,
  })
  spans.push(llm2)
  cursor = addMs(cursor, llm2Duration)

  const totalDuration = cursor.getTime() - ctx.startTime.getTime() + randInt(10, 50)
  const root = makeWrapperSpan({
    base: { ...toBase(ctx, traceId, "", ctx.startTime, totalDuration), durationMs: totalDuration },
    name: `invoke_agent ${ctx.serviceName}`,
  })
  root.span_id = rootSpanId
  root.operation = "invoke_agent"
  spans.unshift(root)

  return { spans, response: assistantReply, durationMs: totalDuration }
}

function generateSessionRagTurn(
  ctx: TraceContext,
  traceId: string,
  session: SessionConfig,
  inputMessages: Message[],
): TurnResult {
  const rootSpanId = randomHex(16)
  const spans: SpanRow[] = []
  let cursor = ctx.startTime

  const embeddingModel = pick(EMBEDDING_MODELS)
  const inputTokens = randInt(50, 300)

  const embDuration = randInt(embeddingModel.latencyRange[0], embeddingModel.latencyRange[1])
  spans.push(
    makeEmbeddingSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, embDuration),
      modelConfig: embeddingModel,
      inputTokens,
    }),
  )
  cursor = addMs(cursor, embDuration)

  const retDuration = randInt(80, 500)
  spans.push(
    makeRetrievalSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, retDuration),
    }),
  )
  cursor = addMs(cursor, retDuration)

  const chatDuration = randInt(session.modelConfig.latencyRange[0], session.modelConfig.latencyRange[1])
  const assistantReply = pick(ASSISTANT_RESPONSES)
  const ragInputMessages = [
    ...inputMessages,
    systemMessage("[Retrieved context: Document 1: ... Document 2: ... Document 3: ...]"),
  ]

  spans.push(
    makeLlmSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, chatDuration),
      modelConfig: session.modelConfig,
      inputMessages: ragInputMessages,
      outputMessages: [assistantTextMessage(assistantReply)],
      systemInstructions: session.systemPrompt,
      finishReason: session.modelConfig.finishReasonStop,
    }),
  )
  cursor = addMs(cursor, chatDuration)

  const totalDuration = cursor.getTime() - ctx.startTime.getTime() + randInt(10, 30)
  const root = makeWrapperSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, totalDuration),
    name: "rag-pipeline",
  })
  root.span_id = rootSpanId
  spans.unshift(root)

  return { spans, response: assistantReply, durationMs: totalDuration }
}

function generateSessionTraces(config: TraceConfig, sessionSize: number): SpanRow[] {
  const session = pickSessionConfig()
  const allSpans: SpanRow[] = []
  const conversationHistory: Message[] = []

  let sessionCursor = randomTimeInWindow(config.timeWindow.from, config.timeWindow.to)

  for (let turn = 0; turn < sessionSize; turn++) {
    const traceId = randomHex(32)
    const isFirstTurn = turn === 0

    const userPrompt = isFirstTurn ? pick(USER_PROMPTS) : pick(SESSION_FOLLOWUPS)
    conversationHistory.push(userMessage(userPrompt))

    const ctx: TraceContext = {
      organizationId: config.organizationId,
      projectId: config.projectId,
      apiKeyId: config.apiKeyId,
      startTime: sessionCursor,
      sessionId: session.sessionId,
      userId: session.userId,
      serviceName: session.serviceName,
      tags: session.tags,
      metadata: session.metadata,
    }

    const useTools = session.availableTools.length > 0 && Math.random() < (isFirstTurn ? 0.3 : 0.5)
    const useRag = session.includeRag && isFirstTurn

    let result: TurnResult

    if (useRag) {
      result = generateSessionRagTurn(ctx, traceId, session, [...conversationHistory])
    } else if (useTools) {
      result = generateSessionToolCallTurn(ctx, traceId, session, [...conversationHistory])
    } else {
      result = generateSessionChatTurn(ctx, traceId, session, [...conversationHistory])
    }

    allSpans.push(...result.spans)
    conversationHistory.push(assistantTextMessage(result.response))

    sessionCursor = addMs(sessionCursor, result.durationMs + randInt(5_000, 300_000))
  }

  return allSpans
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateAllSpans(config: TraceConfig): SpanRow[] {
  const allSpans: SpanRow[] = []

  const sessionTracesBudget = Math.floor(config.traceCount / 3)
  let sessionTracesUsed = 0

  while (sessionTracesUsed < sessionTracesBudget) {
    const sessionSize = randInt(2, 8)
    const actualSize = Math.min(sessionSize, sessionTracesBudget - sessionTracesUsed)
    if (actualSize < 2) break

    allSpans.push(...generateSessionTraces(config, actualSize))
    sessionTracesUsed += actualSize
  }

  const remaining = config.traceCount - sessionTracesUsed
  for (let i = 0; i < remaining; i++) {
    const pattern = pickPattern()
    allSpans.push(...generateTrace(pattern, config))
  }

  return allSpans
}
