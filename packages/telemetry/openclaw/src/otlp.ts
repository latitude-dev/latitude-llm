import { createHash } from "node:crypto"
import { arch, hostname, platform, release } from "node:os"
import type {
  LlmCallRecord,
  OtlpExportRequest,
  OtlpKeyValue,
  OtlpResourceSpans,
  OtlpSpan,
  RunRecord,
  ToolCallRecord,
} from "./types.ts"

const SCOPE_NAME = "@latitude-data/openclaw-telemetry"
const SCOPE_VERSION = "0.0.1"

/** Build an OTLP export request for a single completed agent run. */
export function buildOtlpRequest(run: RunRecord): OtlpExportRequest {
  const spans = buildRunSpans(run)
  const rs: OtlpResourceSpans = {
    resource: { attributes: resourceAttrs() },
    scopeSpans: [{ scope: { name: SCOPE_NAME, version: SCOPE_VERSION }, spans }],
  }
  return { resourceSpans: [rs] }
}

function buildRunSpans(run: RunRecord): OtlpSpan[] {
  const traceId = hashHex(`${run.sessionId ?? "session"}:${run.runId}`, 32)
  const interactionSpanId = hashHex(`${traceId}:run`, 16)
  const out: OtlpSpan[] = [buildInteractionSpan(traceId, interactionSpanId, run)]

  run.llmCalls.forEach((call, idx) => {
    const callSpanId = hashHex(`${traceId}:call:${idx}`, 16)
    out.push(buildLlmSpan(traceId, interactionSpanId, callSpanId, call, idx, run))
    // Tool spans are siblings of the llm_request, parented on the interaction
    // span so the run timeline renders as: llm → tool → llm → tool → ...
    call.toolCalls.forEach((tool, tIdx) => {
      const toolSpanId = hashHex(`${traceId}:call:${idx}:tool:${tIdx}`, 16)
      out.push(buildToolSpan(traceId, interactionSpanId, toolSpanId, tool, run))
    })
  })
  run.orphanTools.forEach((tool, idx) => {
    const toolSpanId = hashHex(`${traceId}:orphan-tool:${idx}`, 16)
    out.push(buildToolSpan(traceId, interactionSpanId, toolSpanId, tool, run))
  })

  return out
}

function buildInteractionSpan(traceId: string, spanId: string, run: RunRecord): OtlpSpan {
  const startNs = msToNs(run.startMs)
  const endNs = msToNs(run.endMs ?? run.startMs)
  const totalTools = run.llmCalls.reduce((sum, c) => sum + c.toolCalls.length, 0) + run.orphanTools.length
  const totalUsage = aggregateUsage(run.llmCalls)

  return {
    traceId,
    spanId,
    parentSpanId: "",
    name: "interaction",
    kind: 1,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    attributes: stripUndef([
      str("span.type", "interaction"),
      str("interaction.kind", "agent_run"),
      str("openclaw.run.id", run.runId),
      run.sessionId ? str("openclaw.session.id", run.sessionId) : undefined,
      run.sessionId ? str("session.id", run.sessionId) : undefined,
      run.sessionKey ? str("openclaw.session.key", run.sessionKey) : undefined,
      run.agentId ? str("openclaw.agent.id", run.agentId) : undefined,
      run.agentId ? str("openclaw.agent.name", run.agentId) : undefined,
      run.workspaceDir ? str("openclaw.workspace.dir", run.workspaceDir) : undefined,
      run.messageProvider ? str("openclaw.message.provider", run.messageProvider) : undefined,
      run.channelId ? str("openclaw.channel.id", run.channelId) : undefined,
      run.trigger ? str("openclaw.trigger", run.trigger) : undefined,
      run.modelProviderId ? str("openclaw.model.provider.id", run.modelProviderId) : undefined,
      run.modelId ? str("openclaw.model.id", run.modelId) : undefined,
      int("interaction.duration_ms", durationMs(run.startMs, run.endMs)),
      int("interaction.call_count", run.llmCalls.length),
      int("interaction.tool_call_count", totalTools),
      run.success !== undefined ? bool("openclaw.run.success", run.success) : undefined,
      run.error ? str("openclaw.run.error", run.error) : undefined,
      totalUsage.input !== undefined ? int("gen_ai.usage.input_tokens", totalUsage.input) : undefined,
      totalUsage.output !== undefined ? int("gen_ai.usage.output_tokens", totalUsage.output) : undefined,
      totalUsage.cacheRead !== undefined
        ? int("gen_ai.usage.cache_read_input_tokens", totalUsage.cacheRead)
        : undefined,
      totalUsage.cacheWrite !== undefined
        ? int("gen_ai.usage.cache_creation_input_tokens", totalUsage.cacheWrite)
        : undefined,
      totalUsage.total !== undefined ? int("gen_ai.usage.total_tokens", totalUsage.total) : undefined,
      // Surface the first user prompt so the Latitude UI has something
      // recognisable in the interaction list.
      run.llmCalls[0]?.prompt ? str("user_prompt", run.llmCalls[0].prompt) : undefined,
    ]),
    status: { code: run.success === false ? 2 : 1 },
  }
}

function buildLlmSpan(
  traceId: string,
  parentSpanId: string,
  spanId: string,
  call: LlmCallRecord,
  callIdx: number,
  run: RunRecord,
): OtlpSpan {
  const startNs = msToNs(call.startMs)
  const endNs = msToNs(call.endMs ?? call.startMs)

  const inputMessages = buildInputMessages(call)
  const outputMessages = buildOutputMessages(call)
  const systemInstructions = call.systemPrompt
    ? JSON.stringify([{ type: "text", content: call.systemPrompt }])
    : undefined

  return {
    traceId,
    spanId,
    parentSpanId,
    name: "llm_request",
    kind: 3,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    attributes: stripUndef([
      str("span.type", "llm_request"),
      str("gen_ai.operation.name", "chat"),
      str("llm_request.context", "interaction"),
      int("llm_request.call_index", callIdx),
      // Provider/model — capture every variant OpenClaw exposes so consumers
      // can filter on whichever form they already use.
      str("gen_ai.system", call.provider),
      str("openclaw.provider", call.provider),
      str("gen_ai.request.model", call.requestModel),
      str("model", call.requestModel),
      call.responseModel ? str("gen_ai.response.model", call.responseModel) : undefined,
      call.resolvedRef ? str("openclaw.resolved.ref", call.resolvedRef) : undefined,
      // Identity — the agent name tag the user specifically asked for is here
      // under both canonical and convenience keys.
      run.sessionId ? str("session.id", run.sessionId) : undefined,
      run.sessionKey ? str("openclaw.session.key", run.sessionKey) : undefined,
      str("openclaw.run.id", call.runId),
      call.agentId ? str("openclaw.agent.id", call.agentId) : undefined,
      call.agentId ? str("openclaw.agent.name", call.agentId) : undefined,
      // Token usage — input / output / cache / total, in both gen_ai.* and
      // legacy aliases for backwards compatibility with existing dashboards.
      call.usage?.input !== undefined ? int("gen_ai.usage.input_tokens", call.usage.input) : undefined,
      call.usage?.input !== undefined ? int("input_tokens", call.usage.input) : undefined,
      call.usage?.output !== undefined ? int("gen_ai.usage.output_tokens", call.usage.output) : undefined,
      call.usage?.output !== undefined ? int("output_tokens", call.usage.output) : undefined,
      call.usage?.cacheRead !== undefined
        ? int("gen_ai.usage.cache_read_input_tokens", call.usage.cacheRead)
        : undefined,
      call.usage?.cacheRead !== undefined ? int("cache_read_tokens", call.usage.cacheRead) : undefined,
      call.usage?.cacheWrite !== undefined
        ? int("gen_ai.usage.cache_creation_input_tokens", call.usage.cacheWrite)
        : undefined,
      call.usage?.cacheWrite !== undefined ? int("cache_creation_tokens", call.usage.cacheWrite) : undefined,
      call.usage?.total !== undefined ? int("gen_ai.usage.total_tokens", call.usage.total) : undefined,
      // Content — system prompt + full message arrays.
      systemInstructions ? str("gen_ai.system_instructions", systemInstructions) : undefined,
      str("gen_ai.input.messages", JSON.stringify(inputMessages)),
      str("gen_ai.output.messages", JSON.stringify(outputMessages)),
      // Misc signals.
      int("openclaw.images.count", call.imagesCount),
      int("llm_request.tool_call_count", call.toolCalls.length),
      int("llm_request.duration_ms", durationMs(call.startMs, call.endMs)),
      call.error ? str("error.type", "llm_error") : undefined,
      call.error ? str("error.message", call.error) : undefined,
      str("success", call.error ? "false" : "true"),
      str("llm_request.captured", "true"),
    ]),
    status: { code: call.error ? 2 : 1 },
  }
}

function buildToolSpan(
  traceId: string,
  parentSpanId: string,
  spanId: string,
  tool: ToolCallRecord,
  run: RunRecord,
): OtlpSpan {
  const startNs = msToNs(tool.startMs)
  const endNs = msToNs(tool.endMs ?? tool.startMs)
  const isError = Boolean(tool.error)
  return {
    traceId,
    spanId,
    parentSpanId,
    name: `tool:${tool.toolName}`,
    kind: 1,
    startTimeUnixNano: startNs,
    endTimeUnixNano: endNs,
    attributes: stripUndef([
      str("span.type", "tool_execution"),
      str("gen_ai.operation.name", "execute_tool"),
      str("gen_ai.tool.name", tool.toolName),
      str("gen_ai.tool.call.id", tool.toolCallId),
      str("gen_ai.tool.call.arguments", safeJson(tool.params)),
      tool.result !== undefined ? str("gen_ai.tool.call.result", safeJson(tool.result)) : undefined,
      isError ? str("error.type", "tool_error") : undefined,
      isError ? str("error.message", tool.error ?? "") : undefined,
      bool("tool.is_error", isError),
      str("success", isError ? "false" : "true"),
      tool.durationMs !== undefined ? int("tool.duration_ms", tool.durationMs) : undefined,
      run.sessionId ? str("session.id", run.sessionId) : undefined,
      run.sessionKey ? str("openclaw.session.key", run.sessionKey) : undefined,
      str("openclaw.run.id", run.runId),
      tool.agentId ? str("openclaw.agent.id", tool.agentId) : undefined,
      tool.agentId ? str("openclaw.agent.name", tool.agentId) : undefined,
    ]),
    status: { code: isError ? 2 : 1 },
  }
}

// ─── Message shape helpers ──────────────────────────────────────────────────
//
// Latitude UI expects `{ role, parts: [{ type, content|... }] }` objects.
// Build both the input (history + current prompt) and output (assistant + any
// tool_calls from this call) arrays in that shape, passing through whatever
// OpenClaw handed us as-is where the shape is already usable.

interface MessagePart {
  type: string
  [key: string]: unknown
}

interface Message {
  role: "system" | "user" | "assistant" | "tool"
  parts: MessagePart[]
}

function buildInputMessages(call: LlmCallRecord): Message[] {
  const out: Message[] = []
  // OpenClaw's `historyMessages` is typed `unknown[]`; we trust it enough to
  // pass through but normalize simple shapes so the Latitude UI has something
  // to render. Complex objects fall back to a JSON stringification.
  for (const msg of call.historyMessages) {
    const normalized = normalizeHistoryMessage(msg)
    if (normalized) out.push(normalized)
  }
  if (call.prompt.length > 0) {
    out.push({ role: "user", parts: [{ type: "text", content: call.prompt }] })
  }
  return out
}

const ALLOWED_ROLES: ReadonlySet<Message["role"]> = new Set(["system", "user", "assistant", "tool"])

function normalizeRole(raw: unknown): Message["role"] {
  // Provider adapters occasionally emit roles outside the canonical set
  // (e.g. OpenAI's "developer"). Coerce unknown roles to "user" so the
  // downstream Latitude UI gets a payload it can render.
  if (typeof raw !== "string") return "user"
  return ALLOWED_ROLES.has(raw as Message["role"]) ? (raw as Message["role"]) : "user"
}

function normalizeHistoryMessage(raw: unknown): Message | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const role = normalizeRole(obj.role)
  const content = obj.content ?? obj.text ?? obj.message
  if (typeof content === "string") {
    return { role, parts: [{ type: "text", content }] }
  }
  if (Array.isArray(content)) {
    const parts: MessagePart[] = []
    for (const block of content) {
      const part = normalizeContentBlock(block)
      if (part) parts.push(part)
    }
    return { role, parts: parts.length > 0 ? parts : [{ type: "text", content: JSON.stringify(content) }] }
  }
  // Unknown shape — dump it as JSON so nothing is silently lost.
  return { role, parts: [{ type: "text", content: safeJson(raw) }] }
}

function normalizeContentBlock(raw: unknown): MessagePart | undefined {
  if (typeof raw === "string") return { type: "text", content: raw }
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>
  const type = typeof obj.type === "string" ? obj.type : "text"
  if (type === "text" && typeof obj.text === "string") return { type: "text", content: obj.text }
  if (type === "tool_use") {
    return {
      type: "tool_call",
      id: typeof obj.id === "string" ? obj.id : "",
      name: typeof obj.name === "string" ? obj.name : "",
      arguments: obj.input ?? {},
    }
  }
  if (type === "tool_result") {
    return {
      type: "tool_call_response",
      id: typeof obj.tool_use_id === "string" ? obj.tool_use_id : "",
      response: obj.content ?? "",
    }
  }
  if (type === "image") {
    return { type: "uri", modality: "image", uri: safeJson(obj.source ?? obj) }
  }
  return { type, content: safeJson(raw) }
}

function buildOutputMessages(call: LlmCallRecord): Message[] {
  const parts: MessagePart[] = []
  for (const text of call.assistantTexts) {
    if (text.length > 0) parts.push({ type: "text", content: text })
  }
  // Attach tool_call parts from tools invoked during this call so the output
  // message reads like the assistant message the model actually produced.
  for (const tool of call.toolCalls) {
    parts.push({
      type: "tool_call",
      id: tool.toolCallId,
      name: tool.toolName,
      arguments: tool.params,
    })
  }
  // Fall back to `lastAssistant` if we have no text/tools (edge case — empty
  // SSE response, failed run).
  if (parts.length === 0 && call.lastAssistant !== undefined) {
    parts.push({ type: "text", content: safeJson(call.lastAssistant) })
  }
  return [{ role: "assistant", parts }]
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function aggregateUsage(calls: LlmCallRecord[]): Required<Partial<import("./types.ts").OpenClawLlmUsage>> {
  const agg = {
    input: undefined as number | undefined,
    output: undefined as number | undefined,
    cacheRead: undefined as number | undefined,
    cacheWrite: undefined as number | undefined,
    total: undefined as number | undefined,
  }
  const add = (k: keyof typeof agg, v: number | undefined): void => {
    if (v === undefined) return
    agg[k] = (agg[k] ?? 0) + v
  }
  for (const c of calls) {
    if (!c.usage) continue
    add("input", c.usage.input)
    add("output", c.usage.output)
    add("cacheRead", c.usage.cacheRead)
    add("cacheWrite", c.usage.cacheWrite)
    add("total", c.usage.total)
  }
  return agg as Required<Partial<import("./types.ts").OpenClawLlmUsage>>
}

function resourceAttrs(): OtlpKeyValue[] {
  return [
    str("service.name", "openclaw"),
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
  return (BigInt(Math.trunc(ms)) * 1_000_000n).toString()
}

function durationMs(startMs: number, endMs: number | undefined): number {
  if (endMs === undefined) return 0
  return Math.max(0, endMs - startMs)
}

function safeJson(value: unknown): string {
  try {
    if (typeof value === "string") return value
    return JSON.stringify(value)
  } catch {
    return ""
  }
}
