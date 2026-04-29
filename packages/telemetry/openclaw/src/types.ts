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
  /**
   * Set only when `trigger === "cron"`. The cron job's id from the user's
   * `~/.openclaw/openclaw.json` cron config (e.g. `"morning-briefing"`).
   * OpenClaw's `buildAgentHookContext` spreads this conditionally.
   */
  jobId?: string
  trace?: unknown
}

export interface OpenClawBeforeAgentStartEvent {
  prompt?: string
  messages?: unknown[]
}

export interface OpenClawAgentEndEvent {
  messages: unknown[]
  success: boolean
  error?: string
  durationMs?: number
}

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
  harnessId?: string
  assistantTexts: string[]
  lastAssistant?: unknown
  usage?: OpenClawLlmUsage
}

/** One per actual provider API call inside an agent attempt. */
export interface OpenClawModelCallStartedEvent {
  runId: string
  callId: string
  sessionId?: string
  sessionKey?: string
  provider: string
  model: string
  api?: string
  transport?: string
}

export interface OpenClawModelCallEndedEvent extends OpenClawModelCallStartedEvent {
  durationMs?: number
  outcome: "completed" | "error"
  errorCategory?: string
  failureKind?: string
  requestPayloadBytes?: number
  responseStreamBytes?: number
  timeToFirstByteMs?: number
  upstreamRequestIdHash?: string
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

export interface OpenClawBeforeCompactionEvent {
  messageCount: number
  messages?: unknown[]
  sessionFile?: string
}

export interface OpenClawAfterCompactionEvent {
  messageCount: number
  compactedCount: number
  tokenCount?: number
  sessionFile?: string
}

export interface OpenClawSubagentSpawnedEvent {
  runId: string
  childSessionKey: string
  agentId: string
  label?: string
  mode?: "run" | "session"
  threadRequested?: boolean
  requester?: {
    channel?: string
    accountId?: string
    to?: string
    threadId?: string | number
  }
}

export interface OpenClawSubagentEndedEvent {
  runId?: string
  targetSessionKey?: string
  targetKind?: string
  reason?: string
  outcome?: string
  error?: string
  sendFarewell?: boolean
  accountId?: string
}
