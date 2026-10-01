// OTLP wire types (shared with @latitude-data/claude-code-telemetry). Hand-rolled
// because the export payload is a small, stable subset of the spec and the OTel
// JS SDK would dominate bundle size for no benefit.

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
// Mirrored from OpenClaw's `src/plugins/hook-types.ts` (2026.9.x). Own copies
// rather than `openclaw/plugin-sdk` imports so the package has no runtime
// dependency on the host and only names the subset it reads.

export interface OpenClawTraceContext {
  traceId?: string
  spanId?: string
  parentSpanId?: string
}

export interface OpenClawAgentContext {
  runId?: string | undefined
  jobId?: string | undefined
  trace?: OpenClawTraceContext | undefined
  agentId?: string | undefined
  sessionKey?: string | undefined
  sessionId?: string | undefined
  workspaceDir?: string | undefined
  modelProviderId?: string | undefined
  modelId?: string | undefined
  messageProvider?: string | undefined
  channel?: string | undefined
  accountId?: string | undefined
  chatId?: string | undefined
  /** Only present when `trigger === "user"`; OpenClaw strips it otherwise. */
  senderId?: string | undefined
  trigger?: string | undefined
  channelId?: string | undefined
  contextTokenBudget?: number | undefined
}

export interface OpenClawAgentEndEvent {
  runId?: string
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
  tools?: unknown[]
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
  reasoningEffort?: string
  fastMode?: boolean
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
  contextTokenBudget?: number
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

export interface OpenClawToolContext {
  agentId?: string | undefined
  sessionKey?: string | undefined
  sessionId?: string | undefined
  runId?: string | undefined
  toolName?: string | undefined
  toolCallId?: string | undefined
  channelId?: string | undefined
  requester?: { channel?: string; accountId?: string; senderId?: string }
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

/** Compaction hooks carry only the session key, never a run id. */
export interface OpenClawSessionScopedContext {
  agentId?: string | undefined
  sessionKey?: string | undefined
  sessionId?: string | undefined
}

export interface OpenClawBeforeCompactionEvent {
  messageCount: number
  compactingCount?: number
  tokenCount?: number
  messages?: unknown[]
  sessionFile?: string
}

export interface OpenClawAfterCompactionEvent {
  messageCount: number
  compactedCount: number
  tokenCount?: number
  sessionFile?: string
  previousSessionId?: string
}

export interface OpenClawSessionStartEvent {
  sessionId: string
  sessionKey?: string
  resumedFrom?: string
}

export interface OpenClawSessionEndEvent {
  sessionId: string
  sessionKey?: string
  messageCount: number
  durationMs?: number
  reason?: string
  nextSessionId?: string
  nextSessionKey?: string
}

/** `runId` is the child's run id; `requesterSessionKey` names the parent session. */
export interface OpenClawSubagentContext {
  runId?: string | undefined
  childSessionKey?: string | undefined
  requesterSessionKey?: string | undefined
}

export interface OpenClawSubagentSpawnedEvent {
  runId: string
  childSessionKey: string
  agentId: string
  label?: string
  mode?: "run" | "session"
  threadRequested?: boolean
  resolvedModel?: string
  resolvedProvider?: string
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
  endedAt?: number
  sendFarewell?: boolean
  accountId?: string
}

export interface OpenClawCronChangedEvent {
  action: "added" | "updated" | "removed" | "started" | "finished" | "scheduled"
  jobId: string
  job?: { id: string; name?: string; agentId?: string }
  agentId?: string
  sessionId?: string
  sessionKey?: string
  runId?: string
  status?: string
  error?: string
  durationMs?: number
  model?: string
  provider?: string
}

export interface OpenClawMessageReceivedEvent {
  from?: string
  content?: string
  senderId?: string
  sessionKey?: string
  runId?: string
  messageId?: string
  metadata?: {
    senderId?: string
    senderName?: string
    senderUsername?: string
    senderE164?: string
    channelName?: string
    provider?: string
  }
}

export interface OpenClawMessageContext {
  channelId?: string | undefined
  accountId?: string | undefined
  conversationId?: string | undefined
  sessionKey?: string | undefined
  runId?: string | undefined
  senderId?: string | undefined
}
