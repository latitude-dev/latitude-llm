// OTLP wire types (shared with @latitude-data/claude-code-telemetry). We hand-roll
// these rather than depending on the OTel JS SDK because the export payload is a
// small, stable subset of the spec and pulling in the SDK would dominate bundle
// size for no benefit.

export interface OtlpAnyValue {
  stringValue?: string
  intValue?: string
  boolValue?: boolean
  doubleValue?: number
  arrayValue?: { values: OtlpAnyValue[] }
}

export interface OtlpKeyValue {
  key: string
  value: OtlpAnyValue
}

export interface OtlpSpan {
  traceId: string
  spanId: string
  parentSpanId: string
  name: string
  kind: number
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes: OtlpKeyValue[]
  status: { code: number }
}

export interface OtlpResourceSpans {
  resource: { attributes: OtlpKeyValue[] }
  scopeSpans: Array<{
    scope: { name: string; version: string }
    spans: OtlpSpan[]
  }>
}

export interface OtlpExportRequest {
  resourceSpans: OtlpResourceSpans[]
}

// ─── OpenClaw hook event shapes ─────────────────────────────────────────────
//
// Mirrored from OpenClaw's src/plugins/hook-types.ts — we keep our own copies
// rather than importing from `openclaw/plugin-sdk` because the plugin-sdk export
// surface is large and version-skew risk across OpenClaw minor releases is
// lower when we depend only on the event-shape subset we actually read.

export interface OpenClawLlmInputEvent {
  runId: string
  sessionId: string
  provider: string
  model: string
  systemPrompt?: string
  prompt: string
  historyMessages: unknown[]
  imagesCount: number
}

export interface OpenClawLlmUsage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  total?: number
}

export interface OpenClawLlmOutputEvent {
  runId: string
  sessionId: string
  provider: string
  model: string
  resolvedRef?: string
  assistantTexts: string[]
  lastAssistant?: unknown
  usage?: OpenClawLlmUsage
}

export interface OpenClawAgentContext {
  runId?: string
  agentId?: string
  sessionKey?: string
  sessionId?: string
  workspaceDir?: string
  modelProviderId?: string
  modelId?: string
  messageProvider?: string
  trigger?: string
  channelId?: string
  trace?: unknown
}

export interface OpenClawBeforeToolCallEvent {
  toolName: string
  params: Record<string, unknown>
  runId?: string
  toolCallId?: string
}

export interface OpenClawAfterToolCallEvent {
  toolName: string
  params: Record<string, unknown>
  runId?: string
  toolCallId?: string
  result?: unknown
  error?: string
  durationMs?: number
}

export interface OpenClawAgentEndEvent {
  messages: unknown[]
  success: boolean
  error?: string
  durationMs?: number
}

export interface OpenClawSessionStartEvent {
  sessionId: string
  sessionKey?: string
  resumedFrom?: string
}

// ─── In-memory state shapes ─────────────────────────────────────────────────

export interface LlmCallRecord {
  runId: string
  sessionId: string
  sessionKey: string | undefined
  agentId: string | undefined
  provider: string
  requestModel: string
  responseModel: string | undefined
  resolvedRef: string | undefined
  systemPrompt: string | undefined
  prompt: string
  historyMessages: unknown[]
  imagesCount: number
  assistantTexts: string[]
  lastAssistant: unknown
  usage: OpenClawLlmUsage | undefined
  startMs: number
  endMs: number | undefined
  error: string | undefined
  toolCalls: ToolCallRecord[]
}

export interface ToolCallRecord {
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
  result: unknown
  error: string | undefined
  startMs: number
  endMs: number | undefined
  durationMs: number | undefined
  agentId: string | undefined
}

export interface RunRecord {
  runId: string
  sessionId: string | undefined
  sessionKey: string | undefined
  agentId: string | undefined
  workspaceDir: string | undefined
  messageProvider: string | undefined
  trigger: string | undefined
  channelId: string | undefined
  modelProviderId: string | undefined
  modelId: string | undefined
  startMs: number
  endMs: number | undefined
  success: boolean | undefined
  error: string | undefined
  llmCalls: LlmCallRecord[]
  /**
   * Tool calls queued by `before_tool_call` but not yet matched to an `llm_call`
   * because the most recent `llm_output` has already closed the call for this
   * runId. Retained so `after_tool_call` can still complete the record.
   */
  orphanTools: ToolCallRecord[]
}
