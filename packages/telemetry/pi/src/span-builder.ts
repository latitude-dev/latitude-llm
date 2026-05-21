import { createHash, randomUUID } from "node:crypto"
import { basename } from "node:path"
import {
  normalizeMessage,
  normalizeMessages,
  safeJson,
  systemInstructionsParts,
  toolResultValue,
  userMessageFromPrompt,
} from "./messages.ts"
import type { AttrValue, BuildResult, PiContext, RuntimeConfig, SpanRecord, UserIdentity } from "./types.ts"

interface RunState {
  traceId: string
  interaction: SpanRecord
  activeLlm: SpanRecord | undefined
  closed: SpanRecord[]
  openTools: Map<string, SpanRecord>
  systemPrompt: string | undefined
  sessionId: string
  sessionFile: string
  cwd: string
  turnNumber: number
}

export class PiSpanBuilder {
  private run: RunState | undefined

  constructor(
    private readonly config: RuntimeConfig,
    private readonly identity: UserIdentity,
  ) {}

  reset(): void {
    this.run = undefined
  }

  onBeforeAgentStart(event: unknown, ctx: PiContext): void {
    const ev = asRecord(event)
    const prompt = typeof ev.prompt === "string" ? ev.prompt : ""
    const images = Array.isArray(ev.images) ? ev.images : undefined
    const systemPrompt = typeof ev.systemPrompt === "string" ? ev.systemPrompt : undefined
    const session = sessionInfo(ctx)
    const traceId = hashHex(`${session.id}:${Date.now()}:${randomUUID()}`, 32)
    const spanId = hashHex(`${traceId}:interaction`, 16)
    const contextAttrs = this.contextAttrs(ctx, session)

    const interaction: SpanRecord = {
      traceId,
      spanId,
      parentSpanId: "",
      name: "interaction",
      startMs: Date.now(),
      endMs: undefined,
      attrs: {
        ...contextAttrs,
        "span.type": "interaction",
        "interaction.kind": "user",
        "session.id": session.id,
        "gen_ai.session.id": session.id,
        "user.id": this.identity.userId,
        "user.email": this.identity.email || undefined,
        "user.name": this.identity.userName,
        "user.full_name": this.identity.fullName || undefined,
        "user_prompt:gated": prompt,
        user_prompt_length: prompt.length,
        "gen_ai.input.messages:gated": [userMessageFromPrompt(prompt, images)],
      },
      outcome: "ok",
    }

    this.run = {
      traceId,
      interaction,
      activeLlm: undefined,
      closed: [],
      openTools: new Map(),
      systemPrompt,
      sessionId: session.id,
      sessionFile: session.file,
      cwd: session.cwd,
      turnNumber: 0,
    }
  }

  onTurnStart(event: unknown, ctx: PiContext): void {
    const run = this.ensureRun(ctx)
    this.closeAbandonedLlm(run)

    const ev = asRecord(event)
    const turnIndex = typeof ev.turnIndex === "number" ? ev.turnIndex : run.turnNumber
    run.turnNumber += 1
    const spanId = hashHex(`${run.traceId}:llm:${run.turnNumber}:${turnIndex}`, 16)
    run.activeLlm = {
      traceId: run.traceId,
      spanId,
      parentSpanId: run.interaction.spanId,
      name: "llm_request",
      startMs: typeof ev.timestamp === "number" ? ev.timestamp : Date.now(),
      endMs: undefined,
      attrs: {
        ...this.contextAttrs(ctx, { id: run.sessionId, file: run.sessionFile, cwd: run.cwd }),
        "span.type": "llm_request",
        "gen_ai.operation.name": "chat",
        "session.id": run.sessionId,
        "gen_ai.session.id": run.sessionId,
        "user.id": this.identity.userId,
        "llm_request.call_index": turnIndex,
        "turn.index": turnIndex,
        "turn.number": run.turnNumber,
        "gen_ai.system_instructions:gated": systemInstructionsParts(run.systemPrompt),
      },
      outcome: "ok",
    }
  }

  onContext(event: unknown): void {
    const run = this.run
    if (!run?.activeLlm) return
    const ev = asRecord(event)
    run.activeLlm.attrs["gen_ai.input.messages:gated"] = normalizeMessages(
      Array.isArray(ev.messages) ? ev.messages : [],
    )
  }

  onBeforeProviderRequest(event: unknown): void {
    const run = this.run
    if (!run?.activeLlm) return
    const payload = asRecord(asRecord(event).payload)
    const payloadText = safeJson(payload)
    run.activeLlm.attrs["pi.provider.payload_bytes"] = payloadText.length
    copyIfString(payload, "model", run.activeLlm.attrs, "gen_ai.request.model")
    copyIfBoolean(payload, "stream", run.activeLlm.attrs, "gen_ai.request.stream")
    copyIfNumber(payload, "max_tokens", run.activeLlm.attrs, "gen_ai.request.max_tokens")
    copyIfNumber(payload, "maxTokens", run.activeLlm.attrs, "gen_ai.request.max_tokens")
    copyIfNumber(payload, "temperature", run.activeLlm.attrs, "gen_ai.request.temperature")
    copyIfNumber(payload, "top_p", run.activeLlm.attrs, "gen_ai.request.top_p")
    copyIfNumber(payload, "topP", run.activeLlm.attrs, "gen_ai.request.top_p")
    if (Array.isArray(payload.tools)) run.activeLlm.attrs["gen_ai.tool.definitions:gated"] = payload.tools
  }

  onMessageEnd(event: unknown): void {
    const message = asRecord(asRecord(event).message)
    if (message.role !== "assistant") return
    const run = this.run
    if (!run?.activeLlm) return
    this.finalizeLlm(run, message, Date.now())
  }

  onTurnEnd(event: unknown): void {
    const run = this.run
    if (!run?.activeLlm) return
    const ev = asRecord(event)
    const message = asRecord(ev.message)
    const toolResults = Array.isArray(ev.toolResults) ? ev.toolResults : []
    run.activeLlm.attrs["turn.tool_results"] = toolResults.length
    if (message.role === "assistant") {
      this.finalizeLlm(run, message, Date.now())
      return
    }
    this.closeAbandonedLlm(run)
  }

  onToolExecutionStart(event: unknown, ctx: PiContext): void {
    const run = this.ensureRun(ctx)
    const ev = asRecord(event)
    const toolCallId = typeof ev.toolCallId === "string" ? ev.toolCallId : randomUUID()
    const toolName = typeof ev.toolName === "string" ? ev.toolName : "unknown"
    const args = ev.args
    const spanId = hashHex(`${run.traceId}:tool:${toolCallId}:${run.openTools.size}`, 16)
    const span: SpanRecord = {
      traceId: run.traceId,
      spanId,
      parentSpanId: run.interaction.spanId,
      name: `tool_call:${toolName}`,
      startMs: Date.now(),
      endMs: undefined,
      attrs: {
        ...this.contextAttrs(ctx, { id: run.sessionId, file: run.sessionFile, cwd: run.cwd }),
        "span.type": "tool_execution",
        "gen_ai.operation.name": "execute_tool",
        "session.id": run.sessionId,
        "gen_ai.session.id": run.sessionId,
        "user.id": this.identity.userId,
        "gen_ai.tool.name": toolName,
        "gen_ai.tool.call.id": toolCallId,
        "gen_ai.tool.call.arguments:gated": attrValue(args),
      },
      outcome: "ok",
    }
    run.openTools.set(toolCallId, span)
  }

  onToolExecutionEnd(event: unknown): void {
    const run = this.run
    if (!run) return
    const ev = asRecord(event)
    const toolCallId = typeof ev.toolCallId === "string" ? ev.toolCallId : undefined
    const span = (toolCallId ? run.openTools.get(toolCallId) : undefined) ?? this.findLatestToolByName(run, ev.toolName)
    if (!span) return

    span.endMs = Date.now()
    const isError = ev.isError === true
    span.outcome = isError ? "error" : "ok"
    span.errorMessage = isError ? "Tool execution failed" : undefined
    span.attrs["tool.is_error"] = isError
    span.attrs.success = isError ? "false" : "true"
    const resultValue = attrValue(toolResultValue(ev.result))
    span.attrs["gen_ai.tool.call.result:gated"] = resultValue
    if (isError) {
      span.attrs["error.type"] = "tool_error"
      span.attrs["error.message:gated"] = resultValue
    }
    span.attrs["pi.tool.duration_ms"] = Math.max(0, span.endMs - span.startMs)

    if (toolCallId) run.openTools.delete(toolCallId)
    else this.deleteToolSpan(run, span)
    run.closed.push(span)
  }

  onSessionCompact(event: unknown): void {
    const run = this.run
    if (!run) return
    const ev = asRecord(event)
    run.interaction.attrs["pi.session.compacted"] = true
    run.interaction.attrs["pi.session.compaction.from_extension"] = ev.fromExtension === true
  }

  onAgentEnd(event: unknown, ctx: PiContext): BuildResult | undefined {
    const run = this.run
    if (!run) return undefined
    const ev = asRecord(event)
    const messages = Array.isArray(ev.messages) ? ev.messages : []
    const outputMessages = normalizeMessages(messages).filter((message) => message.role === "assistant")
    if (outputMessages.length > 0) run.interaction.attrs["gen_ai.output.messages:gated"] = outputMessages
    if (messages.length > 0) run.interaction.attrs["pi.agent.messages:gated"] = normalizeMessages(messages)
    run.interaction.attrs["pi.turns"] = run.turnNumber
    run.interaction.attrs["pi.tool_calls"] = run.closed.filter(
      (span) => span.attrs["span.type"] === "tool_execution",
    ).length

    this.closeAbandonedLlm(run)
    this.closeAbandonedTools(run)

    run.interaction.endMs = Date.now()
    run.interaction.outcome = "ok"
    Object.assign(
      run.interaction.attrs,
      this.contextAttrs(ctx, { id: run.sessionId, file: run.sessionFile, cwd: run.cwd }),
    )

    const result = { traceId: run.traceId, spans: [run.interaction, ...run.closed] }
    this.run = undefined
    return result
  }

  private ensureRun(ctx: PiContext): RunState {
    if (this.run) return this.run
    this.onBeforeAgentStart({ prompt: "" }, ctx)
    if (!this.run) throw new Error("Latitude pi telemetry failed to create a run")
    return this.run
  }

  private finalizeLlm(run: RunState, message: Record<string, unknown>, fallbackEndMs: number): void {
    const span = run.activeLlm
    if (!span) return
    span.endMs = typeof message.timestamp === "number" ? message.timestamp : fallbackEndMs
    const normalized = normalizeMessage(message)
    if (normalized) span.attrs["gen_ai.output.messages:gated"] = [normalized]

    const provider = typeof message.provider === "string" ? message.provider : undefined
    const model = typeof message.model === "string" ? message.model : undefined
    if (provider) {
      span.attrs["gen_ai.provider.name"] = provider
      span.attrs["gen_ai.system"] = provider
    }
    if (model) {
      span.attrs.model = model
      if (span.attrs["gen_ai.request.model"] === undefined) span.attrs["gen_ai.request.model"] = model
      span.attrs["gen_ai.response.model"] = model
    }

    const usage = asRecord(message.usage)
    const input = numberValue(usage.input)
    const output = numberValue(usage.output)
    const cacheRead = numberValue(usage.cacheRead)
    const cacheWrite = numberValue(usage.cacheWrite)
    const total = numberValue(usage.totalTokens)
    if (input !== undefined) {
      span.attrs.input_tokens = input
      span.attrs["gen_ai.usage.input_tokens"] = input
    }
    if (output !== undefined) {
      span.attrs.output_tokens = output
      span.attrs["gen_ai.usage.output_tokens"] = output
    }
    if (cacheRead !== undefined) {
      span.attrs.cache_read_tokens = cacheRead
      span.attrs["gen_ai.usage.cache_read.input_tokens"] = cacheRead
    }
    if (cacheWrite !== undefined) {
      span.attrs.cache_creation_tokens = cacheWrite
      span.attrs["gen_ai.usage.cache_creation.input_tokens"] = cacheWrite
    }
    if (total !== undefined) span.attrs["gen_ai.usage.total_tokens"] = total

    const stopReason = typeof message.stopReason === "string" ? message.stopReason : undefined
    if (stopReason) span.attrs["gen_ai.response.finish_reasons"] = [stopReason]
    if (stopReason === "error" || stopReason === "aborted") {
      span.outcome = "error"
      span.errorMessage = typeof message.errorMessage === "string" ? message.errorMessage : stopReason
      span.attrs["error.type"] = stopReason
      span.attrs["error.message:gated"] = span.errorMessage
    } else {
      span.outcome = "ok"
    }

    span.attrs["llm_request.duration_ms"] = Math.max(0, span.endMs - span.startMs)
    run.closed.push(span)
    run.activeLlm = undefined
  }

  private closeAbandonedLlm(run: RunState): void {
    const span = run.activeLlm
    if (!span) return
    span.endMs = Date.now()
    span.outcome = "error"
    span.errorMessage = "llm_request abandoned before assistant message_end"
    span.attrs["error.type"] = "abandoned"
    span.attrs["error.message"] = span.errorMessage
    run.closed.push(span)
    run.activeLlm = undefined
  }

  private closeAbandonedTools(run: RunState): void {
    for (const [id, span] of run.openTools) {
      span.endMs = Date.now()
      span.outcome = "error"
      span.errorMessage = "tool_execution abandoned before tool_execution_end"
      span.attrs["error.type"] = "abandoned"
      span.attrs["error.message"] = span.errorMessage
      span.attrs["tool.is_error"] = true
      run.closed.push(span)
      run.openTools.delete(id)
    }
  }

  private findLatestToolByName(run: RunState, rawToolName: unknown): SpanRecord | undefined {
    const toolName = typeof rawToolName === "string" ? rawToolName : undefined
    const entries = Array.from(run.openTools.values())
    for (let i = entries.length - 1; i >= 0; i--) {
      const span = entries[i]
      if (!span) continue
      if (!toolName || span.attrs["gen_ai.tool.name"] === toolName) return span
    }
    return undefined
  }

  private deleteToolSpan(run: RunState, span: SpanRecord): void {
    for (const [id, candidate] of run.openTools) {
      if (candidate === span) {
        run.openTools.delete(id)
        return
      }
    }
  }

  private contextAttrs(ctx: PiContext, session: { id: string; file: string; cwd: string }): Record<string, AttrValue> {
    const metadata: Record<string, string> = {
      ...this.config.metadata,
      "pi.cwd": session.cwd,
      "pi.session.id": session.id,
    }
    if (session.file) metadata["pi.session.file"] = session.file
    const sessionName = ctx.sessionManager?.getSessionName?.()
    if (sessionName) metadata["pi.session.name"] = sessionName

    return {
      "latitude.tags": this.config.tags,
      "latitude.metadata": metadata,
      "pi.cwd": session.cwd,
      "pi.cwd.basename": basename(session.cwd),
      "pi.session.file": session.file || undefined,
      "pi.session.id": session.id,
      "service.instance.id": session.id,
    }
  }
}

function sessionInfo(ctx: PiContext): { id: string; file: string; cwd: string } {
  const cwd = ctx.cwd ?? process.cwd()
  const file = ctx.sessionManager?.getSessionFile?.() ?? ""
  const id = ctx.sessionManager?.getSessionId?.() ?? fileOrEphemeral(file)
  return { id, file, cwd }
}

function fileOrEphemeral(file: string): string {
  return file || `ephemeral:${randomUUID()}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function attrValue(value: unknown): AttrValue {
  if (value === undefined) return undefined
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value
  if (value && typeof value === "object") return value as Record<string, unknown>
  return String(value)
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function copyIfString(
  source: Record<string, unknown>,
  from: string,
  target: Record<string, AttrValue>,
  to: string,
): void {
  if (typeof source[from] === "string") target[to] = source[from]
}

function copyIfNumber(
  source: Record<string, unknown>,
  from: string,
  target: Record<string, AttrValue>,
  to: string,
): void {
  if (typeof source[from] === "number") target[to] = source[from]
}

function copyIfBoolean(
  source: Record<string, unknown>,
  from: string,
  target: Record<string, AttrValue>,
  to: string,
): void {
  if (typeof source[from] === "boolean") target[to] = source[from]
}

function hashHex(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length)
}
