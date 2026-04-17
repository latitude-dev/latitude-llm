export interface HookPayload {
  session_id?: string
  sessionId?: string
  transcript_path?: string
  transcriptPath?: string
  cwd?: string
}

export interface TextBlock {
  type: "text"
  text: string
}

export interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: unknown
}

export interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: unknown
  is_error?: boolean
}

export interface ThinkingBlock {
  type: "thinking"
  thinking: string
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | { type: string; [key: string]: unknown }

export interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export interface InnerMessage {
  id?: string
  role?: "user" | "assistant"
  model?: string
  content?: string | ContentBlock[]
  usage?: Usage
}

export interface TranscriptRow {
  type?: "user" | "assistant" | "summary" | "system" | "file-history-snapshot"
  subtype?: string
  message?: InnerMessage
  content?: string | ContentBlock[]
  uuid?: string
  timestamp?: string
  parentUuid?: string | null
  isMeta?: boolean
  isSidechain?: boolean
  promptId?: string
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
  output?: unknown
  isError?: boolean
  promptId?: string
  subagent?: SubagentInvocation
}

export interface SubagentInvocation {
  agentId: string
  agentType: string
  description: string
  turns: Turn[]
}

export interface Turn {
  userText: string
  assistantText: string
  model: string
  tokens: Usage
  toolCalls: ToolCall[]
  startMs: number
  endMs: number
}

export interface SubagentFile {
  agentId: string
  filePath: string
  metaPath: string
}

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
