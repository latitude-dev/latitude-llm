// OTLP wire types. We hand-roll the small JSON subset Latitude needs instead
// of depending on the OpenTelemetry SDK inside the pi extension runtime.

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
  status: { code: number; message?: string | undefined }
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

export interface MessagePart {
  type: string
  content?: string
  id?: string
  name?: string
  arguments?: unknown
  response?: unknown
  modality?: string
  uri?: string
  [key: string]: unknown
}

export type MessageRole = "system" | "user" | "assistant" | "tool"

export interface GenAIMessage {
  role: MessageRole
  parts: MessagePart[]
}

export type AttrValue = string | number | boolean | unknown[] | Record<string, unknown> | undefined

export interface SpanRecord {
  spanId: string
  traceId: string
  parentSpanId: string
  name: string
  startMs: number
  endMs: number | undefined
  attrs: Record<string, AttrValue>
  outcome?: "ok" | "error" | undefined
  errorMessage?: string | undefined
}

export interface BuildResult {
  traceId: string
  spans: SpanRecord[]
}

export interface PiExtensionAPI {
  on(eventName: string, handler: (event: unknown, ctx: PiContext) => unknown | Promise<unknown>): void
}

export interface PiContext {
  cwd?: string | undefined
  hasUI?: boolean | undefined
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error") => void
    setStatus?: (key: string, value: string | undefined) => void
    theme?: {
      fg?: (name: string, value: string) => string
    }
  }
  sessionManager?: {
    getSessionId?: () => string
    getSessionFile?: () => string | undefined
    getSessionName?: () => string | undefined
  }
  model?: {
    provider?: string
    id?: string
  }
}

export interface RuntimeConfig {
  apiKey: string
  project: string
  baseUrl: string
  enabled: boolean
  debug: boolean
  allowConversationAccess: boolean
  tags: string[]
  metadata: Record<string, string>
  configSource: "env" | "file" | "none"
}

export interface UserIdentity {
  userId: string
  userName: string
  fullName: string
  email: string
  hostName: string
}
