import { createHash } from "node:crypto"
import { arch, hostname, platform, release } from "node:os"
import { type RedactConfig, redactAttributes } from "./redaction.ts"
import type { AnthropicMessage, AnthropicMessageBlock, AnthropicSystem, StoredRequest } from "./request-store.ts"
import type {
  AgentSpanLink,
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

// Byte budgets (JSON string length as a proxy for bytes — the payload is almost
// entirely ASCII). A long agentic turn can contain hundreds of LLM calls, each
// embedding the full conversation context; on real sessions that produced single
// POSTs of 130-340 MB, which can neither finish uploading inside the client
// timeout nor pass the ingest rate limit (64 MB/min), so the whole turn was lost.
// Spans under SPAN_BYTE_BUDGET are emitted untouched; oversized spans get their
// bulkiest attributes truncated, lowest-value content first. The per-attribute
// caps below sum to roughly SPAN_BYTE_BUDGET.
const SPAN_BYTE_BUDGET = 128 * 1024
const INPUT_MESSAGES_CAP = 64 * 1024
const OUTPUT_MESSAGES_CAP = 32 * 1024
const SYSTEM_CAP = 16 * 1024
const TOOL_DEFS_CAP = 16 * 1024
const TOOL_ARGS_CAP = 16 * 1024
const USER_PROMPT_CAP = 64 * 1024
// Each POST is kept under this size so it completes well inside the client
// timeout even on modest uplinks; one logical trace may span several POSTs
// (the server groups spans by trace_id, so splitting is transparent).
const POST_BYTE_BUDGET = 3 * 1024 * 1024

export function buildOtlpRequest(opts: {
  sessionId: string
  userId?: string | undefined
  turnStartNumber: number
  turns: Turn[]
  context?: TraceContext | undefined
  conversationHistory?: Turn[] | undefined
  requestsByMessageId?: Map<string, StoredRequest> | undefined
  redact?: RedactConfig | undefined
  // Out-param: populated with one link per parent Agent tool call emitted, so the
  // caller can (re-)attach subagent spans under it on later turns.
  agentLinks?: AgentSpanLink[]
}): OtlpExportRequest {
  const contextAttrs = buildContextAttrs(opts.context)
  const history = opts.conversationHistory ?? []
  const requestsByMessageId = opts.requestsByMessageId ?? new Map<string, StoredRequest>()
  const spans: OtlpSpan[] = []
  opts.turns.forEach((turn, i) => {
    const turnNum = opts.turnStartNumber + i
    const priorTurns = [...history, ...opts.turns.slice(0, i)]
    spans.push(
      ...buildTurnSpans(
        opts.sessionId,
        opts.userId,
        turnNum,
        turn,
        contextAttrs,
        priorTurns,
        requestsByMessageId,
        opts.agentLinks,
      ),
    )
  })

  const redact = opts.redact
  const redactedSpans = redact ? spans.map((span) => redactSpan(span, redact)) : spans
  const rs: OtlpResourceSpans = {
    resource: { attributes: resourceAttrs() },
    scopeSpans: [
      {
        scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
        spans: redactedSpans,
      },
    ],
  }

  return { resourceSpans: [rs] }
}

function redactSpan(span: OtlpSpan, redact: RedactConfig): OtlpSpan {
  return { ...span, attributes: redactAttributes(span.attributes, redact) }
}

function buildTurnSpans(
  sessionId: string,
  userId: string | undefined,
  turnNum: number,
  turn: Turn,
  contextAttrs: OtlpKeyValue[],
  priorTurns: Turn[],
  requestsByMessageId: Map<string, StoredRequest>,
  agentLinks: AgentSpanLink[] | undefined,
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
    subagentName: undefined,
    turnNum,
    interactionIdSalt: "turn",
    genIdSalt: "gen",
    contextAttrs,
    priorTurns,
    requestsByMessageId,
    agentLinks,
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
  subagentName: string | undefined
  turnNum: number | undefined
  interactionIdSalt: string
  genIdSalt: string
  contextAttrs: OtlpKeyValue[]
  priorTurns: Turn[]
  requestsByMessageId: Map<string, StoredRequest>
  agentLinks: AgentSpanLink[] | undefined
  // Emission window (subagent incremental re-emission). Defaults emit everything.
  emitInteraction?: boolean
  callFrom?: number
  callTo?: number
}

function buildInteractionTree(out: OtlpSpan[], ctx: TreeCtx): void {
  const { traceId, sessionId, userId, turn, isSubagent, subagentLabel, subagentName, turnNum } = ctx
  const startNs = msToNs(turn.startMs)
  const endNs = msToNs(turn.endMs)
  const durationMs = Math.max(0, turn.endMs - turn.startMs)
  const callCount = turn.calls.length
  const totalToolCalls = turn.calls.reduce((sum, c) => sum + c.toolUses.length, 0)
  const promptText = clamp(turn.userText, USER_PROMPT_CAP)

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
      str("user_prompt", promptText),
      int("user_prompt_length", turn.userText.length),
      int("interaction.duration_ms", durationMs),
      int("interaction.call_count", callCount),
      int("interaction.tool_call_count", totalToolCalls),
      turnNum !== undefined ? int("turn.number", turnNum) : undefined,
      isSubagent && subagentLabel ? str("subagent.id", subagentLabel) : undefined,
      isSubagent && subagentName ? str("subagent.name", subagentName) : undefined,
      str("gen_ai.input.messages", JSON.stringify([messagePart("user", promptText)])),
      promptText.length < turn.userText.length ? str("latitude.truncation", "user prompt clamped") : undefined,
      // Diagnostic: per-interaction snapshot of what the hook saw from the intercept.
      // Shows up in the Latitude UI so users can see exactly why llm_request.captured
      // did or didn't land on a given trace.
      str("latitude.debug.message_ids", turn.calls.map((c) => c.messageId).join(",")),
      str(
        "latitude.debug.captured_message_ids",
        turn.calls
          .filter((c) => ctx.requestsByMessageId.has(c.messageId))
          .map((c) => c.messageId)
          .join(","),
      ),
      int("latitude.debug.captured_count", countCapturedCalls(turn, ctx.requestsByMessageId)),
      ...ctx.contextAttrs,
    ]),
    status: { code: 1 },
  }
  if (ctx.emitInteraction ?? true) out.push(interactionSpan)

  const callFrom = ctx.callFrom ?? 0
  const callTo = ctx.callTo ?? turn.calls.length
  turn.calls.forEach((call, callIdx) => {
    if (callIdx < callFrom || callIdx >= callTo) return
    emitCallAndTools(out, ctx, call, callIdx)
  })
}

function emitCallAndTools(out: OtlpSpan[], ctx: TreeCtx, call: AssistantCall, callIdx: number): void {
  const { traceId, sessionId, userId, turn, isSubagent, subagentLabel, subagentName } = ctx
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

  const payloads = capLlmRequestPayload({
    inputMessages,
    outputMessages,
    systemParts: captured?.system ? buildSystemParts(captured.system) : undefined,
    toolDefs: captured?.tools && captured.tools.length > 0 ? captured.tools : undefined,
  })

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
      isSubagent && subagentName ? str("subagent.name", subagentName) : undefined,
      payloads.systemJson ? str("gen_ai.system_instructions", payloads.systemJson) : undefined,
      payloads.toolDefsJson ? str("gen_ai.tool.definitions", payloads.toolDefsJson) : undefined,
      str("gen_ai.input.messages", payloads.inputJson),
      str("gen_ai.output.messages", payloads.outputJson),
      payloads.truncationNote ? str("latitude.truncation", payloads.truncationNote) : undefined,
      // Diagnostic: show the lookup outcome per span so it's visible in the UI.
      str("latitude.debug.lookup_message_id", call.messageId),
      str("latitude.debug.request_file_found", captured ? "true" : "false"),
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

    if (!isSubagent && tool.name === "Agent") {
      ctx.agentLinks?.push({ toolUseId: tool.id, promptId: tool.promptId, traceId, parentSpanId: toolSpanId })
    }

    if (tool.subagent) {
      const totalCalls = tool.subagent.turns.reduce((sum, t) => sum + t.calls.length, 0)
      emitSubagentTree(out, {
        traceId,
        parentSpanId: toolSpanId,
        sessionId,
        userId,
        subagent: tool.subagent,
        contextAttrs: ctx.contextAttrs,
        requestsByMessageId: ctx.requestsByMessageId,
        emitInteraction: true,
        fromCall: 0,
        toCall: totalCalls,
      })
    }
  })
}

interface SubagentTreeCtx {
  traceId: string
  parentSpanId: string
  sessionId: string
  userId: string | undefined
  subagent: SubagentInvocation
  contextAttrs: OtlpKeyValue[]
  requestsByMessageId: Map<string, StoredRequest>
  // Emission window over the subagent's calls, flattened across its turns. The
  // interaction span is emitted only when emitInteraction is set. Defaults emit all.
  emitInteraction: boolean
  fromCall: number
  toCall: number
}

// Emits a subagent's interaction/llm_request/tool subtree under `parentSpanId`.
// Span ids are salted only by traceId, agentId, and turn/call index — never by how
// many calls exist yet — so emitting calls incrementally across turns produces the
// same ids a single full emission would. Each span is therefore inserted at most
// once, which keeps the additive trace-level aggregates (span_count, tokens, cost)
// correct: those come from a plain per-insert GROUP BY with no dedup, unlike the
// spans table's ReplacingMergeTree.
function emitSubagentTree(out: OtlpSpan[], ctx: SubagentTreeCtx): void {
  const { subagent } = ctx
  let globalIdx = 0
  subagent.turns.forEach((subTurn, subIdx) => {
    const subSalt = `sub:${subagent.agentId}:${subIdx}`
    const count = subTurn.calls.length
    buildInteractionTree(out, {
      traceId: ctx.traceId,
      turnSpanId: hashHex(`${ctx.traceId}:${subSalt}:turn`, 16),
      parentSpanId: ctx.parentSpanId,
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      turn: subTurn,
      isSubagent: true,
      subagentLabel: subagentAttr(subagent),
      subagentName: subagent.agentType,
      turnNum: undefined,
      interactionIdSalt: `${subSalt}:turn`,
      genIdSalt: `${subSalt}:gen`,
      contextAttrs: ctx.contextAttrs,
      priorTurns: subagent.turns.slice(0, subIdx),
      requestsByMessageId: ctx.requestsByMessageId,
      agentLinks: undefined,
      emitInteraction: ctx.emitInteraction,
      callFrom: Math.max(0, ctx.fromCall - globalIdx),
      callTo: Math.min(count, ctx.toCall - globalIdx),
    })
    globalIdx += count
  })
}

// Standalone subagent subtree for re-emission on a later turn: builds context
// attrs and applies redaction itself (it does not pass through buildOtlpRequest).
// `fromCall`/`toCall` bound which calls (flattened across the subagent's turns) are
// emitted this pass, and `emitInteraction` controls the one-time interaction span,
// so a growing transcript sends each span exactly once.
export function buildSubagentSpans(opts: {
  sessionId: string
  userId?: string | undefined
  traceId: string
  parentSpanId: string
  subagent: SubagentInvocation
  emitInteraction?: boolean
  fromCall?: number
  toCall?: number
  context?: TraceContext | undefined
  requestsByMessageId?: Map<string, StoredRequest> | undefined
  redact?: RedactConfig | undefined
}): OtlpSpan[] {
  const out: OtlpSpan[] = []
  const totalCalls = opts.subagent.turns.reduce((sum, t) => sum + t.calls.length, 0)
  emitSubagentTree(out, {
    traceId: opts.traceId,
    parentSpanId: opts.parentSpanId,
    sessionId: opts.sessionId,
    userId: opts.userId,
    subagent: opts.subagent,
    contextAttrs: buildContextAttrs(opts.context),
    requestsByMessageId: opts.requestsByMessageId ?? new Map<string, StoredRequest>(),
    emitInteraction: opts.emitInteraction ?? true,
    fromCall: opts.fromCall ?? 0,
    toCall: opts.toCall ?? totalCalls,
  })
  return opts.redact ? out.map((span) => redactSpan(span, opts.redact as RedactConfig)) : out
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
  let argsJson = safeJson(call.input)
  let resultJson = call.output !== undefined ? safeJson(call.output) : undefined
  let truncationNote: string | undefined
  if (argsJson.length + (resultJson?.length ?? 0) > SPAN_BYTE_BUDGET) {
    const notes: string[] = []
    if (argsJson.length > TOOL_ARGS_CAP) {
      argsJson = clamp(argsJson, TOOL_ARGS_CAP)
      notes.push("tool arguments clamped")
    }
    const resultCap = SPAN_BYTE_BUDGET - TOOL_ARGS_CAP
    if (resultJson !== undefined && resultJson.length > resultCap) {
      resultJson = clamp(resultJson, resultCap)
      notes.push("tool result clamped")
    }
    truncationNote = notes.join("; ") || undefined
  }
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
      str("gen_ai.tool.call.arguments", argsJson),
      resultJson !== undefined ? str("gen_ai.tool.call.result", resultJson) : undefined,
      truncationNote ? str("latitude.truncation", truncationNote) : undefined,
      call.isError ? str("error.type", "tool_error") : undefined,
      bool("tool.is_error", call.isError === true),
      str("success", call.isError ? "false" : "true"),
      call.subagent ? str("subagent.id", subagentAttr(call.subagent)) : undefined,
      call.subagent ? str("subagent.name", call.subagent.agentType) : undefined,
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

function countCapturedCalls(turn: Turn, requestsByMessageId: Map<string, StoredRequest>): number {
  return turn.calls.reduce((sum, call) => sum + (requestsByMessageId.has(call.messageId) ? 1 : 0), 0)
}

function buildSystemParts(system: AnthropicSystem): MessagePart[] {
  if (!system) return []
  if (typeof system === "string") {
    return [{ type: "text", content: system }]
  }
  return system.map((block) => ({
    type: "text",
    content: typeof block.text === "string" ? block.text : typeof block.content === "string" ? block.content : "",
  }))
}

interface LlmRequestPayloads {
  inputJson: string
  outputJson: string
  systemJson: string | undefined
  toolDefsJson: string | undefined
  truncationNote: string | undefined
}

function capLlmRequestPayload(args: {
  inputMessages: Message[]
  outputMessages: Message[]
  systemParts: MessagePart[] | undefined
  toolDefs: unknown[] | undefined
}): LlmRequestPayloads {
  let inputJson = JSON.stringify(args.inputMessages)
  let outputJson = JSON.stringify(args.outputMessages)
  let systemJson = args.systemParts ? JSON.stringify(args.systemParts) : undefined
  let toolDefsJson = args.toolDefs ? JSON.stringify(args.toolDefs) : undefined

  const total = inputJson.length + outputJson.length + (systemJson?.length ?? 0) + (toolDefsJson?.length ?? 0)
  if (total <= SPAN_BYTE_BUDGET) {
    return { inputJson, outputJson, systemJson, toolDefsJson, truncationNote: undefined }
  }

  const notes: string[] = []
  if (args.toolDefs && toolDefsJson && toolDefsJson.length > TOOL_DEFS_CAP) {
    const r = capToolDefinitions(args.toolDefs, TOOL_DEFS_CAP)
    toolDefsJson = r.json
    if (r.note) notes.push(`tool definitions: ${r.note}`)
  }
  if (args.systemParts && systemJson && systemJson.length > SYSTEM_CAP) {
    const r = capPartsJson(args.systemParts, SYSTEM_CAP)
    systemJson = r.json
    if (r.note) notes.push(`system instructions: ${r.note}`)
  }
  if (outputJson.length > OUTPUT_MESSAGES_CAP) {
    const r = capMessagesJson(args.outputMessages, OUTPUT_MESSAGES_CAP)
    outputJson = r.json
    if (r.note) notes.push(`output messages: ${r.note}`)
  }
  if (inputJson.length > INPUT_MESSAGES_CAP) {
    const r = capMessagesJson(args.inputMessages, INPUT_MESSAGES_CAP)
    inputJson = r.json
    if (r.note) notes.push(`input messages: ${r.note}`)
  }
  return { inputJson, outputJson, systemJson, toolDefsJson, truncationNote: notes.join(" | ") || undefined }
}

interface CapResult {
  json: string
  note?: string
}

// Keeps the most recent messages that fit the budget — the tail (current prompt and
// latest tool context) is what the UI shows first; older context is recoverable from
// earlier llm_request spans of the same session. Always emits valid JSON.
function capMessagesJson(messages: Message[], maxBytes: number): CapResult {
  const full = JSON.stringify(messages)
  if (full.length <= maxBytes) return { json: full }

  let budget = maxBytes - 2 // surrounding brackets
  let start = messages.length
  while (start > 0) {
    const last = messages[start - 1]
    const cost = JSON.stringify(last).length + 1
    if (cost > budget) break
    budget -= cost
    start--
  }

  let kept = messages.slice(start)
  const notes: string[] = []
  if (kept.length === 0) {
    // Even the newest message alone exceeds the budget: shrink its parts instead.
    const last = messages[messages.length - 1]
    if (last) {
      const perPart = Math.max(1024, Math.floor(maxBytes / Math.max(1, last.parts.length)) - 64)
      kept.push({ ...last, parts: last.parts.map((p) => shrinkPart(p, perPart)) })
      notes.push("shrunk oversized message parts")
    }
    start = messages.length - 1
  }
  if (start > 0) notes.push(`dropped ${start} oldest of ${messages.length} messages`)
  const stripped = stripOrphanToolResponses(kept)
  if (stripped.length !== kept.length || stripped.some((m, i) => m.parts.length !== kept[i]!.parts.length)) {
    notes.push("stripped orphan tool responses")
  }
  kept = stripped
  return { json: JSON.stringify(kept), note: notes.join("; ") }
}

function stripOrphanToolResponses(messages: Message[]): Message[] {
  const knownIds = new Set<string>()
  for (const message of messages) {
    if (message.role !== "assistant") continue
    for (const part of message.parts) {
      if (part.type !== "tool_call") continue
      const id = typeof part.id === "string" ? part.id.trim() : ""
      if (id) knownIds.add(id)
    }
  }
  return messages.flatMap((message) => {
    if (message.role !== "tool") return [message]
    const parts = message.parts.filter((part) => {
      if (part.type !== "tool_call_response") return true
      const id = typeof part.id === "string" ? part.id.trim() : ""
      return id !== "" && knownIds.has(id)
    })
    if (parts.length === 0) return []
    return [{ ...message, parts }]
  })
}

function capPartsJson(parts: MessagePart[], maxBytes: number): CapResult {
  const full = JSON.stringify(parts)
  if (full.length <= maxBytes) return { json: full }
  const perPart = Math.max(512, Math.floor(maxBytes / Math.max(1, parts.length)) - 32)
  return { json: JSON.stringify(parts.map((p) => shrinkPart(p, perPart))), note: `shrunk ${parts.length} part(s)` }
}

function toolNameStub(tool: unknown): unknown {
  if (!tool || typeof tool !== "object") return tool
  const name = (tool as { name?: unknown }).name
  return typeof name === "string" ? { name } : tool
}

// Never drop tool names when capping — definedTools keys off names; only schemas are optional.
function capToolDefinitions(tools: unknown[], maxBytes: number): CapResult {
  const full = JSON.stringify(tools)
  if (full.length <= maxBytes) return { json: full }

  const stubs = tools.map(toolNameStub)
  const stubCosts = stubs.map((stub) => JSON.stringify(stub).length + 1)
  const suffixStubBytes = new Array<number>(tools.length + 1)
  suffixStubBytes[tools.length] = 0
  for (let i = tools.length - 1; i >= 0; i--) {
    suffixStubBytes[i] = suffixStubBytes[i + 1]! + stubCosts[i]!
  }

  let budget = maxBytes - 2
  const out: unknown[] = []
  let fullCount = 0
  for (let i = 0; i < tools.length; i++) {
    const fullCost = JSON.stringify(tools[i]).length + 1
    if (fullCost + suffixStubBytes[i + 1]! <= budget) {
      out.push(tools[i])
      budget -= fullCost
      fullCount++
      continue
    }
    for (let j = i; j < tools.length; j++) {
      const stubCost = stubCosts[j]!
      if (stubCost > budget) {
        return {
          json: JSON.stringify(out),
          note: `kept ${out.length} of ${tools.length} names (${fullCount} full schemas, ${out.length - fullCount} name-only)`,
        }
      }
      out.push(stubs[j])
      budget -= stubCost
    }
    break
  }

  const stubCount = out.length - fullCount
  return {
    json: JSON.stringify(out),
    note: `kept all ${tools.length} names (${fullCount} full schemas, ${stubCount} name-only)`,
  }
}

function shrinkPart(part: MessagePart, maxBytes: number): MessagePart {
  if (JSON.stringify(part).length <= maxBytes) return part
  if (typeof part.content === "string") return { ...part, content: clamp(part.content, maxBytes) }
  if ("response" in part) return { ...part, response: clamp(safeJson(part.response), maxBytes) }
  if ("arguments" in part) return { ...part, arguments: { truncated: clamp(safeJson(part.arguments), maxBytes) } }
  return part
}

function clamp(s: string, maxLength: number): string {
  if (s.length <= maxLength) return s
  return `${s.slice(0, maxLength)}… [latitude: truncated ${s.length - maxLength} chars]`
}

// Splits one export request into several, each under maxBytes when serialized, by
// distributing spans across copies of the same resource/scope envelope. The server
// groups spans by trace_id, so a trace arriving across multiple POSTs is assembled
// identically to one arriving whole.
export function chunkOtlpRequest(req: OtlpExportRequest, maxBytes = POST_BYTE_BUDGET): OtlpExportRequest[] {
  const rs = req.resourceSpans[0]
  const ss = rs?.scopeSpans[0]
  if (!rs || !ss || req.resourceSpans.length !== 1 || rs.scopeSpans.length !== 1) return [req]

  const wrap = (spans: OtlpSpan[]): OtlpExportRequest => ({
    resourceSpans: [{ resource: rs.resource, scopeSpans: [{ scope: ss.scope, spans }] }],
  })
  const overhead = JSON.stringify(wrap([])).length

  const batches: OtlpSpan[][] = []
  let current: OtlpSpan[] = []
  let size = overhead
  for (const span of ss.spans) {
    const cost = JSON.stringify(span).length + 1
    if (current.length > 0 && size + cost > maxBytes) {
      batches.push(current)
      current = []
      size = overhead
    }
    current.push(span)
    size += cost
  }
  if (current.length > 0) batches.push(current)
  if (batches.length <= 1) return [req]
  return batches.map(wrap)
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
