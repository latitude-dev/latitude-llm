import { createHash } from "node:crypto"
import { arch, hostname, platform, release } from "node:os"
import type { AnthropicMessage, AnthropicMessageBlock, AnthropicSystem, StoredRequest } from "./request-store.ts"
import type {
  AssistantCall,
  OtlpExportRequest,
  OtlpKeyValue,
  OtlpResourceSpans,
  OtlpSpan,
  SubagentInvocation,
  ToolCall,
  TraceContext,
  Turn,
} from "./types.ts"

const SCOPE_NAME = "@latitude-data/claude-code-telemetry"
const SCOPE_VERSION = "0.0.1"

export function buildOtlpRequest(opts: {
  sessionId: string
  userId?: string | undefined
  turnStartNumber: number
  turns: Turn[]
  context?: TraceContext | undefined
  conversationHistory?: Turn[] | undefined
  requestsByMessageId?: Map<string, StoredRequest> | undefined
}): OtlpExportRequest {
  const contextAttrs = buildContextAttrs(opts.context)
  const history = opts.conversationHistory ?? []
  const requestsByMessageId = opts.requestsByMessageId ?? new Map<string, StoredRequest>()
  const spans: OtlpSpan[] = []
  opts.turns.forEach((turn, i) => {
    const turnNum = opts.turnStartNumber + i
    const priorTurns = [...history, ...opts.turns.slice(0, i)]
    spans.push(
      ...buildTurnSpans(opts.sessionId, opts.userId, turnNum, turn, contextAttrs, priorTurns, requestsByMessageId),
    )
  })

  const rs: OtlpResourceSpans = {
    resource: { attributes: resourceAttrs() },
    scopeSpans: [
      {
        scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
        spans,
      },
    ],
  }

  return { resourceSpans: [rs] }
}

function buildTurnSpans(
  sessionId: string,
  userId: string | undefined,
  turnNum: number,
  turn: Turn,
  contextAttrs: OtlpKeyValue[],
  priorTurns: Turn[],
  requestsByMessageId: Map<string, StoredRequest>,
): OtlpSpan[] {
  const traceId = hashHex(`${sessionId}:${turnNum}`, 32)
  const turnSpanId = hashHex(`${traceId}:turn`, 16)
  const out: OtlpSpan[] = []
  buildInteractionTree(out, {
    traceId,
    turnSpanId,
    parentSpanId: "",
    sessionId,
    userId,
    turn,
    isSubagent: false,
    subagentLabel: undefined,
    turnNum,
    interactionIdSalt: "turn",
    genIdSalt: "gen",
    contextAttrs,
    priorTurns,
    requestsByMessageId,
  })
  return out
}

interface TreeCtx {
  traceId: string
  turnSpanId: string
  parentSpanId: string
  sessionId: string
  userId: string | undefined
  turn: Turn
  isSubagent: boolean
  subagentLabel: string | undefined
  turnNum: number | undefined
  interactionIdSalt: string
  genIdSalt: string
  contextAttrs: OtlpKeyValue[]
  priorTurns: Turn[]
  requestsByMessageId: Map<string, StoredRequest>
}

function buildInteractionTree(out: OtlpSpan[], ctx: TreeCtx): void {
  const { traceId, sessionId, userId, turn, isSubagent, subagentLabel, turnNum } = ctx
  const startNs = msToNs(turn.startMs)
  const endNs = msToNs(turn.endMs)
  const durationMs = Math.max(0, turn.endMs - turn.startMs)
  const callCount = turn.calls.length
  const totalToolCalls = turn.calls.reduce((sum, c) => sum + c.toolUses.length, 0)

  const interactionSpan: OtlpSpan = {
    traceId,
    spanId: ctx.turnSpanId,
    parentSpanId: ctx.parentSpanId,
    name: "interaction",
    kind: 1,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    attributes: stripUndef([
      str("span.type", "interaction"),
      str("interaction.kind", isSubagent ? "subagent" : "user"),
      str("session.id", sessionId),
      userId ? str("user.id", userId) : undefined,
      str("user_prompt", turn.userText),
      int("user_prompt_length", turn.userText.length),
      int("interaction.duration_ms", durationMs),
      int("interaction.call_count", callCount),
      int("interaction.tool_call_count", totalToolCalls),
      turnNum !== undefined ? int("turn.number", turnNum) : undefined,
      isSubagent && subagentLabel ? str("subagent.id", subagentLabel) : undefined,
      str("gen_ai.input.messages", JSON.stringify([messagePart("user", turn.userText)])),
      ...ctx.contextAttrs,
    ]),
    status: { code: 1 },
  }
  out.push(interactionSpan)

  turn.calls.forEach((call, callIdx) => {
    emitCallAndTools(out, ctx, call, callIdx)
  })
}

function emitCallAndTools(out: OtlpSpan[], ctx: TreeCtx, call: AssistantCall, callIdx: number): void {
  const { traceId, sessionId, userId, turn, isSubagent, subagentLabel } = ctx
  const callStartNs = msToNs(call.startMs)
  const callEndNs = msToNs(call.endMs)

  const callSalt = `${ctx.genIdSalt}:call:${callIdx}:${call.messageId}`
  const callSpanId = hashHex(`${traceId}:${callSalt}`, 16)

  const storedRequest = ctx.requestsByMessageId.get(call.messageId)
  const captured = storedRequest?.request

  // Prefer the exact payload that hit the Anthropic API when we captured it; otherwise
  // fall back to the reconstruction we can synthesize from the transcript alone.
  const inputMessages = captured?.messages
    ? convertAnthropicMessages(captured.messages)
    : buildCallInputMessages({ callIdx, priorTurns: ctx.priorTurns, turn })
  const outputMessages = [assistantMessageFromCall(call)]

  const systemAttr = captured?.system ? buildSystemInstructions(captured.system) : undefined
  const toolDefsAttr = captured?.tools && captured.tools.length > 0 ? JSON.stringify(captured.tools) : undefined

  const callSpan: OtlpSpan = {
    traceId,
    spanId: callSpanId,
    parentSpanId: ctx.turnSpanId,
    name: "llm_request",
    kind: 3,
    startTimeUnixNano: callStartNs,
    endTimeUnixNano: callEndNs,
    attributes: stripUndef([
      str("span.type", "llm_request"),
      str("gen_ai.operation.name", "chat"),
      str("session.id", sessionId),
      userId ? str("user.id", userId) : undefined,
      str("llm_request.context", isSubagent ? "subagent_interaction" : "interaction"),
      int("llm_request.call_index", callIdx),
      str("llm_request.message_id", call.messageId),
      captured ? str("llm_request.captured", "true") : undefined,
      str("model", call.model),
      str("gen_ai.request.model", captured?.model ?? call.model),
      str("gen_ai.response.model", call.model),
      captured?.max_tokens !== undefined ? int("gen_ai.request.max_tokens", captured.max_tokens) : undefined,
      captured?.temperature !== undefined ? str("gen_ai.request.temperature", String(captured.temperature)) : undefined,
      captured?.top_p !== undefined ? str("gen_ai.request.top_p", String(captured.top_p)) : undefined,
      captured?.stream !== undefined ? bool("gen_ai.request.stream", captured.stream) : undefined,
      call.tokens.input_tokens !== undefined ? int("input_tokens", call.tokens.input_tokens) : undefined,
      call.tokens.input_tokens !== undefined ? int("gen_ai.usage.input_tokens", call.tokens.input_tokens) : undefined,
      call.tokens.output_tokens !== undefined ? int("output_tokens", call.tokens.output_tokens) : undefined,
      call.tokens.output_tokens !== undefined
        ? int("gen_ai.usage.output_tokens", call.tokens.output_tokens)
        : undefined,
      call.tokens.cache_read_input_tokens !== undefined
        ? int("cache_read_tokens", call.tokens.cache_read_input_tokens)
        : undefined,
      call.tokens.cache_read_input_tokens !== undefined
        ? int("gen_ai.usage.cache_read.input_tokens", call.tokens.cache_read_input_tokens)
        : undefined,
      call.tokens.cache_creation_input_tokens !== undefined
        ? int("cache_creation_tokens", call.tokens.cache_creation_input_tokens)
        : undefined,
      str("success", "true"),
      isSubagent && subagentLabel ? str("subagent.id", subagentLabel) : undefined,
      systemAttr ? str("gen_ai.system_instructions", systemAttr) : undefined,
      toolDefsAttr ? str("gen_ai.tool.definitions", toolDefsAttr) : undefined,
      str("gen_ai.input.messages", JSON.stringify(inputMessages)),
      str("gen_ai.output.messages", JSON.stringify(outputMessages)),
      ...ctx.contextAttrs,
    ]),
    status: { code: 1 },
  }
  out.push(callSpan)

  call.toolUses.forEach((tool, idx) => {
    const toolSpanId = hashHex(`${traceId}:${callSalt}:tool:${idx}:${tool.id}`, 16)
    // Tool executions are siblings of the llm_request, not children — the model finishes
    // generating and then the tool runs afterward, sequentially. Parent under the
    // interaction so the timeline reads as: llm_request → tool → llm_request → tool → ...
    out.push(buildToolSpan(traceId, ctx.turnSpanId, toolSpanId, sessionId, userId, tool, ctx.contextAttrs))

    const subagent = tool.subagent
    if (!subagent) return
    subagent.turns.forEach((subTurn, subIdx) => {
      const subSalt = `sub:${subagent.agentId}:${subIdx}`
      buildInteractionTree(out, {
        traceId,
        turnSpanId: hashHex(`${traceId}:${subSalt}:turn`, 16),
        parentSpanId: toolSpanId,
        sessionId,
        userId,
        turn: subTurn,
        isSubagent: true,
        subagentLabel: subagentAttr(subagent),
        turnNum: undefined,
        interactionIdSalt: `${subSalt}:turn`,
        genIdSalt: `${subSalt}:gen`,
        contextAttrs: ctx.contextAttrs,
        priorTurns: subagent.turns.slice(0, subIdx),
        requestsByMessageId: ctx.requestsByMessageId,
      })
    })
  })
}

function subagentAttr(sub: SubagentInvocation): string {
  return `${sub.agentType}:${sub.agentId}`
}

function buildToolSpan(
  traceId: string,
  parentSpanId: string,
  spanId: string,
  sessionId: string,
  userId: string | undefined,
  call: ToolCall,
  contextAttrs: OtlpKeyValue[],
): OtlpSpan {
  return {
    traceId,
    spanId,
    parentSpanId,
    name: `tool:${call.name}`,
    kind: 1,
    startTimeUnixNano: msToNs(call.startMs),
    endTimeUnixNano: msToNs(call.endMs),
    attributes: stripUndef([
      str("span.type", "tool_execution"),
      str("gen_ai.operation.name", "execute_tool"),
      str("session.id", sessionId),
      userId ? str("user.id", userId) : undefined,
      str("gen_ai.tool.name", call.name),
      str("gen_ai.tool.call.id", call.id),
      str("gen_ai.tool.call.arguments", safeJson(call.input)),
      call.output !== undefined ? str("gen_ai.tool.call.result", safeJson(call.output)) : undefined,
      call.isError ? str("error.type", "tool_error") : undefined,
      bool("tool.is_error", call.isError === true),
      str("success", call.isError ? "false" : "true"),
      call.subagent ? str("subagent.id", subagentAttr(call.subagent)) : undefined,
      call.subagent ? str("subagent.type", call.subagent.agentType) : undefined,
      call.subagent ? int("subagent.turn_count", call.subagent.turns.length) : undefined,
      ...contextAttrs,
    ]),
    status: { code: call.isError ? 2 : 1 },
  }
}

function buildContextAttrs(context: TraceContext | undefined): OtlpKeyValue[] {
  if (!context) return []
  const attrs: OtlpKeyValue[] = []
  if (context.tags.length > 0) attrs.push(str("latitude.tags", JSON.stringify(context.tags)))
  if (Object.keys(context.metadata).length > 0) {
    attrs.push(str("latitude.metadata", JSON.stringify(context.metadata)))
  }
  return attrs
}

interface MessagePart {
  type: string
  [key: string]: unknown
}

interface Message {
  role: "user" | "assistant" | "tool"
  parts: MessagePart[]
}

function messagePart(role: "user" | "assistant", content: string): Message {
  return { role, parts: [{ type: "text", content }] }
}

function assistantMessageFromCall(call: AssistantCall): Message {
  const parts: MessagePart[] = []
  if (call.text.length > 0) parts.push({ type: "text", content: call.text })
  for (const tu of call.toolUses) {
    parts.push({ type: "tool_call", id: tu.id, name: tu.name, arguments: tu.input })
  }
  return { role: "assistant", parts }
}

function toolResponseMessage(toolUses: ToolCall[]): Message | undefined {
  const parts: MessagePart[] = []
  for (const tu of toolUses) {
    if (tu.output === undefined) continue
    parts.push({ type: "tool_call_response", id: tu.id, response: tu.output })
  }
  if (parts.length === 0) return undefined
  return { role: "tool", parts }
}

function flattenTurnMessages(turn: Turn): Message[] {
  const messages: Message[] = [messagePart("user", turn.userText)]
  for (const call of turn.calls) {
    messages.push(assistantMessageFromCall(call))
    const toolMsg = toolResponseMessage(call.toolUses)
    if (toolMsg) messages.push(toolMsg)
  }
  return messages
}

function buildSystemInstructions(system: AnthropicSystem): string {
  if (!system) return JSON.stringify([])
  if (typeof system === "string") {
    return JSON.stringify([{ type: "text", content: system }])
  }
  const parts = system.map((block) => ({
    type: "text",
    content: typeof block.text === "string" ? block.text : typeof block.content === "string" ? block.content : "",
  }))
  return JSON.stringify(parts)
}

function convertAnthropicMessages(messages: AnthropicMessage[]): Message[] {
  const out: Message[] = []
  for (const m of messages) {
    out.push(...convertAnthropicMessage(m))
  }
  return out
}

function convertAnthropicMessage(m: AnthropicMessage): Message[] {
  if (typeof m.content === "string") {
    return [{ role: m.role, parts: [{ type: "text", content: m.content }] }]
  }
  const primaryParts: MessagePart[] = []
  const toolResponseParts: MessagePart[] = []
  for (const block of m.content) {
    convertBlock(block, primaryParts, toolResponseParts)
  }
  const result: Message[] = []
  if (primaryParts.length > 0) result.push({ role: m.role, parts: primaryParts })
  if (toolResponseParts.length > 0) result.push({ role: "tool", parts: toolResponseParts })
  return result
}

function convertBlock(block: AnthropicMessageBlock, primary: MessagePart[], toolResponses: MessagePart[]): void {
  if (block.type === "text" && typeof block.text === "string") {
    primary.push({ type: "text", content: block.text })
    return
  }
  if (block.type === "tool_use") {
    primary.push({
      type: "tool_call",
      id: block.id ?? "",
      name: block.name ?? "",
      arguments: block.input ?? {},
    })
    return
  }
  if (block.type === "tool_result") {
    toolResponses.push({
      type: "tool_call_response",
      id: block.tool_use_id ?? "",
      response: block.content ?? "",
    })
    return
  }
  if (block.type === "thinking" && typeof block.thinking === "string") {
    primary.push({ type: "reasoning", content: block.thinking })
    return
  }
  if (block.type === "image" && block.source) {
    const { media_type, data, url } = block.source
    const uri = url ?? (data ? `data:${media_type ?? "image/unknown"};base64,${data}` : "")
    if (uri) primary.push({ type: "uri", modality: "image", uri })
    return
  }
  // Unknown block type — stringify as text so nothing is silently dropped.
  primary.push({ type: "text", content: JSON.stringify(block) })
}

function buildCallInputMessages(args: { callIdx: number; priorTurns: Turn[]; turn: Turn }): Message[] {
  const { callIdx, priorTurns, turn } = args
  // Each llm_request carries the FULL conversation that went to the model for that call:
  // the session history so far, the current user prompt, and every prior call in this
  // turn (assistant message with its tool_calls + the tool responses that came back).
  // This matches what actually hit the API — the model sees the accumulated context on
  // every step of a tool loop, and tokens are billed against it.
  const messages: Message[] = []
  for (const t of priorTurns) messages.push(...flattenTurnMessages(t))
  messages.push(messagePart("user", turn.userText))
  for (let i = 0; i < callIdx; i++) {
    const prev = turn.calls[i]
    if (!prev) continue
    messages.push(assistantMessageFromCall(prev))
    const toolMsg = toolResponseMessage(prev.toolUses)
    if (toolMsg) messages.push(toolMsg)
  }
  return messages
}

function resourceAttrs(): OtlpKeyValue[] {
  return [
    str("service.name", "claude-code"),
    str("service.version", SCOPE_VERSION),
    str("host.name", hostname()),
    str("host.arch", arch()),
    str("os.type", platform()),
    str("os.version", release()),
  ]
}

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(Math.trunc(value)) } }
}

function bool(key: string, value: boolean): OtlpKeyValue {
  return { key, value: { boolValue: value } }
}

function stripUndef(items: Array<OtlpKeyValue | undefined>): OtlpKeyValue[] {
  return items.filter((x): x is OtlpKeyValue => x !== undefined)
}

function hashHex(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length)
}

function msToNs(ms: number): string {
  // BigInt to keep precision beyond 2^53
  return (BigInt(Math.trunc(ms)) * 1_000_000n).toString()
}

function safeJson(value: unknown): string {
  try {
    if (typeof value === "string") return value
    return JSON.stringify(value)
  } catch {
    return ""
  }
}
