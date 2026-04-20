import { createHash } from "node:crypto"
import { arch, hostname, platform, release } from "node:os"
import type {
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
}): OtlpExportRequest {
  const contextAttrs = buildContextAttrs(opts.context)
  const history = opts.conversationHistory ?? []
  const spans: OtlpSpan[] = []
  opts.turns.forEach((turn, i) => {
    const turnNum = opts.turnStartNumber + i
    const priorTurns = [...history, ...opts.turns.slice(0, i)]
    spans.push(...buildTurnSpans(opts.sessionId, opts.userId, turnNum, turn, contextAttrs, priorTurns))
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
}

function buildInteractionTree(out: OtlpSpan[], ctx: TreeCtx): void {
  const { traceId, sessionId, userId, turn, isSubagent, subagentLabel, turnNum } = ctx
  const startNs = msToNs(turn.startMs)
  const endNs = msToNs(turn.endMs)
  const durationMs = Math.max(0, turn.endMs - turn.startMs)

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
      turnNum !== undefined ? int("turn.number", turnNum) : undefined,
      isSubagent && subagentLabel ? str("subagent.id", subagentLabel) : undefined,
      str("gen_ai.input.messages", JSON.stringify([messagePart("user", turn.userText)])),
      ...ctx.contextAttrs,
    ]),
    status: { code: 1 },
  }
  out.push(interactionSpan)

  const genSpanId = hashHex(`${traceId}:${ctx.genIdSalt}`, 16)
  const genSpan: OtlpSpan = {
    traceId,
    spanId: genSpanId,
    parentSpanId: ctx.turnSpanId,
    name: "llm_request",
    kind: 3,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    attributes: stripUndef([
      str("span.type", "llm_request"),
      str("session.id", sessionId),
      userId ? str("user.id", userId) : undefined,
      str("llm_request.context", isSubagent ? "subagent_interaction" : "interaction"),
      str("model", turn.model),
      turn.tokens.input_tokens !== undefined ? int("input_tokens", turn.tokens.input_tokens) : undefined,
      turn.tokens.output_tokens !== undefined ? int("output_tokens", turn.tokens.output_tokens) : undefined,
      turn.tokens.cache_read_input_tokens !== undefined
        ? int("cache_read_tokens", turn.tokens.cache_read_input_tokens)
        : undefined,
      turn.tokens.cache_creation_input_tokens !== undefined
        ? int("cache_creation_tokens", turn.tokens.cache_creation_input_tokens)
        : undefined,
      str("success", "true"),
      isSubagent && subagentLabel ? str("subagent.id", subagentLabel) : undefined,
      str("gen_ai.input.messages", JSON.stringify(buildInputMessages(ctx.priorTurns, turn.userText))),
      str("gen_ai.output.messages", JSON.stringify([messagePart("assistant", turn.assistantText)])),
      int("gen_ai.input.messages.count", ctx.priorTurns.length * 2 + 1),
      ...ctx.contextAttrs,
    ]),
    status: { code: 1 },
  }
  out.push(genSpan)

  turn.toolCalls.forEach((call, idx) => {
    const toolSpanId = hashHex(`${traceId}:${ctx.genIdSalt}:tool:${idx}:${call.id}`, 16)
    out.push(buildToolSpan(traceId, genSpanId, toolSpanId, sessionId, userId, startNs, endNs, call, ctx.contextAttrs))

    const subagent = call.subagent
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
  startNs: string,
  endNs: string,
  call: ToolCall,
  contextAttrs: OtlpKeyValue[],
): OtlpSpan {
  return {
    traceId,
    spanId,
    parentSpanId,
    name: `tool:${call.name}`,
    kind: 1,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
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

function messagePart(role: "user" | "assistant", content: string) {
  return { role, parts: [{ type: "text", content }] }
}

function buildInputMessages(priorTurns: Turn[], currentUserText: string) {
  const messages = []
  for (const t of priorTurns) {
    messages.push(messagePart("user", t.userText))
    if (t.assistantText.length > 0) messages.push(messagePart("assistant", t.assistantText))
  }
  messages.push(messagePart("user", currentUserText))
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
