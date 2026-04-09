import type { AgentProfile, ToolConfig } from "@domain/shared/seeding"
import { EMBEDDING_MODELS } from "@domain/shared/seeding"
import {
  addMs,
  assistantTextMessage,
  assistantToolCallMessage,
  formatClickhouseTime,
  type Message,
  makeEmbeddingSpan,
  makeLlmSpan,
  makeRetrievalSpan,
  makeToolSpan,
  makeWrapperSpan,
  pick,
  pickN,
  randFloat,
  randInt,
  randomHex,
  type SpanRow,
  systemMessage,
  type TraceContext,
  toBase,
  toolResultMessage,
  userMessage,
} from "./span-builders.ts"

// ---------------------------------------------------------------------------
// Pattern 1: Simple chat completion (1 span)
// ---------------------------------------------------------------------------

function generateSimpleChat(
  ctx: TraceContext,
  agent: AgentProfile,
  inputMessages: Message[],
  assistantReply: string,
): SpanRow[] {
  const traceId = randomHex(32)
  const modelConfig = pick(agent.models)
  const duration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
  const temperature = Math.round(randFloat(0, 1) * 10) / 10

  const span = makeLlmSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, duration),
    modelConfig,
    inputMessages,
    outputMessages: [assistantTextMessage(assistantReply)],
    systemInstructions: agent.systemPrompt,
    finishReason: modelConfig.finishReasonStop,
    temperature,
  })
  return [span]
}

// ---------------------------------------------------------------------------
// Pattern 2: Chat with a single round of tool calls (3+ spans)
// ---------------------------------------------------------------------------

function generateToolCallTrace(
  ctx: TraceContext,
  agent: AgentProfile,
  inputMessages: Message[],
  assistantReply: string,
  toolsToUse?: readonly ToolConfig[],
): SpanRow[] {
  const traceId = randomHex(32)
  const modelConfig = pick(agent.models)
  const toolDefinitions = agent.tools ? [...agent.tools] : undefined
  const tools = toolsToUse ? [...toolsToUse] : pickN(toolDefinitions ?? [], randInt(1, 3))
  const spans: SpanRow[] = []
  let cursor = ctx.startTime
  const rootSpanId = randomHex(16)

  const conversationHistory: Message[] = [...inputMessages]

  const llm1Duration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
  const toolCalls = tools.map((t) => ({
    id: `call_${randomHex(24)}`,
    name: t.name,
    args: t.sampleArgs,
  }))

  const llm1 = makeLlmSpan({
    base: toBase(ctx, traceId, rootSpanId, cursor, llm1Duration),
    modelConfig,
    inputMessages: conversationHistory,
    outputMessages: [assistantToolCallMessage(toolCalls)],
    systemInstructions: agent.systemPrompt,
    ...(toolDefinitions ? { toolDefinitions } : {}),
    finishReason: "tool_calls",
  })
  spans.push(llm1)
  cursor = addMs(cursor, llm1Duration)

  conversationHistory.push(assistantToolCallMessage(toolCalls))

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

  const llm2Duration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
  const llm2 = makeLlmSpan({
    base: toBase(ctx, traceId, rootSpanId, cursor, llm2Duration),
    modelConfig,
    inputMessages: conversationHistory,
    outputMessages: [assistantTextMessage(assistantReply)],
    systemInstructions: agent.systemPrompt,
    ...(toolDefinitions ? { toolDefinitions } : {}),
    finishReason: modelConfig.finishReasonStop,
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

  return spans
}

// ---------------------------------------------------------------------------
// Pattern 3: RAG pipeline (3-5 spans)
// ---------------------------------------------------------------------------

function generateRagTrace(
  ctx: TraceContext,
  agent: AgentProfile,
  inputMessages: Message[],
  assistantReply: string,
): SpanRow[] {
  const traceId = randomHex(32)
  const rootSpanId = randomHex(16)
  const spans: SpanRow[] = []
  let cursor = ctx.startTime

  const embeddingModel = agent.embeddingModels ? pick(agent.embeddingModels) : pick(EMBEDDING_MODELS)
  const chatModel = pick(agent.models)
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

  const chatDuration = randInt(chatModel.latencyRange[0], chatModel.latencyRange[1])
  spans.push(
    makeLlmSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, chatDuration),
      modelConfig: chatModel,
      inputMessages: [
        ...inputMessages,
        systemMessage("[Retrieved context: Document 1: ... Document 2: ... Document 3: ...]"),
      ],
      outputMessages: [assistantTextMessage(assistantReply)],
      systemInstructions: agent.systemPrompt,
      finishReason: chatModel.finishReasonStop,
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

  return spans
}

// ---------------------------------------------------------------------------
// Pattern 4 & 5: Multi-step / Complex agent (5-25 spans)
// ---------------------------------------------------------------------------

function generateAgentTrace(
  ctx: TraceContext,
  agent: AgentProfile,
  inputMessages: Message[],
  assistantReply: string,
  { maxSteps, allowNesting }: { maxSteps: number; allowNesting: boolean },
): SpanRow[] {
  const traceId = randomHex(32)
  const rootSpanId = randomHex(16)
  const spans: SpanRow[] = []
  let cursor = ctx.startTime

  const modelConfig = pick(agent.models)
  const availableTools = agent.tools ? [...agent.tools] : []
  const conversationHistory: Message[] = [...inputMessages]
  const toolCallSteps = randInt(1, maxSteps)

  for (let step = 0; step <= toolCallSteps; step++) {
    const isLastStep = step === toolCallSteps
    const finishReason = isLastStep ? modelConfig.finishReasonStop : "tool_calls"
    const toolsThisStep = isLastStep ? [] : pickN(availableTools, randInt(1, 3))

    const llmDuration = randInt(modelConfig.latencyRange[0], modelConfig.latencyRange[1])
    const toolCalls = toolsThisStep.map((t) => ({
      id: `call_${randomHex(24)}`,
      name: t.name,
      args: t.sampleArgs,
    }))

    const outputMessages = isLastStep ? [assistantTextMessage(assistantReply)] : [assistantToolCallMessage(toolCalls)]

    const llmSpan = makeLlmSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, llmDuration),
      modelConfig,
      inputMessages: [...conversationHistory],
      outputMessages,
      systemInstructions: agent.systemPrompt,
      toolDefinitions: availableTools,
      finishReason,
      temperature: Math.round(randFloat(0, 1) * 10) / 10,
    })
    spans.push(llmSpan)
    cursor = addMs(cursor, llmDuration)

    if (!isLastStep) {
      conversationHistory.push(assistantToolCallMessage(toolCalls))
    }

    for (let i = 0; i < toolsThisStep.length; i++) {
      const tool = toolsThisStep[i] as ToolConfig
      const callId = (toolCalls[i] as { id: string }).id
      const toolDuration = randInt(tool.latencyRange[0], tool.latencyRange[1])
      const toolSpan = makeToolSpan({
        base: toBase(ctx, traceId, rootSpanId, cursor, toolDuration),
        tool,
        callId,
      })

      if (allowNesting && Math.random() < 0.25) {
        const fastModels = agent.models.filter((m) => m.latencyRange[0] < 1000)
        const nestedModel = pick(fastModels.length > 0 ? fastModels : agent.models)
        const nestedDuration = randInt(nestedModel.latencyRange[0], nestedModel.latencyRange[1])
        const nestedStart = addMs(cursor, Math.floor(toolDuration * 0.1))

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

// ---------------------------------------------------------------------------
// Pattern 6: Error trace (1-2 spans)
// ---------------------------------------------------------------------------

function generateErrorTrace(ctx: TraceContext, agent: AgentProfile, inputMessages: Message[]): SpanRow[] {
  const traceId = randomHex(32)
  const modelConfig = pick(agent.models)
  const error = pick(agent.errorTypes)
  const duration = randInt(50, modelConfig.latencyRange[0])

  const span = makeLlmSpan({
    base: toBase(ctx, traceId, "", ctx.startTime, duration),
    modelConfig,
    inputMessages,
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

/**
 * Dispatches a trace by pattern type using the agent's profile.
 */
export function generateTraceByPattern(
  ctx: TraceContext,
  agent: AgentProfile,
  pattern: string,
  inputMessages: Message[],
  assistantReply: string,
): SpanRow[] {
  switch (pattern) {
    case "simple_chat":
      return generateSimpleChat(ctx, agent, inputMessages, assistantReply)
    case "tool_call":
      return generateToolCallTrace(ctx, agent, inputMessages, assistantReply)
    case "rag":
      return generateRagTrace(ctx, agent, inputMessages, assistantReply)
    case "multi_step":
      return generateAgentTrace(ctx, agent, inputMessages, assistantReply, {
        maxSteps: randInt(2, 5),
        allowNesting: false,
      })
    case "complex_agent":
      return generateAgentTrace(ctx, agent, inputMessages, assistantReply, {
        maxSteps: randInt(4, 8),
        allowNesting: true,
      })
    case "error":
      return generateErrorTrace(ctx, agent, inputMessages)
    default:
      return generateSimpleChat(ctx, agent, inputMessages, assistantReply)
  }
}
