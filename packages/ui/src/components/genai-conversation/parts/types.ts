export interface TextPart {
  readonly type: "text"
  readonly content: string
  readonly _provider_metadata?: Record<string, unknown>
}

export interface BlobPart {
  readonly type: "blob"
  readonly content: string
  readonly modality: string
  readonly mime_type?: string | null | undefined
}

export interface FilePart {
  readonly type: "file"
  readonly file_id: string
  readonly modality: string
  readonly mime_type?: string | null | undefined
}

export interface UriPart {
  readonly type: "uri"
  readonly uri: string
  readonly modality: string
  readonly mime_type?: string | null | undefined
}

export interface ReasoningPart {
  readonly type: "reasoning"
  readonly content: string
}

export interface ToolCallPart {
  readonly type: "tool_call"
  readonly name: string
  readonly id?: string | null | undefined
  readonly arguments?: unknown
}

export interface ToolCallResponsePart {
  readonly type: "tool_call_response"
  readonly id?: string | null | undefined
  readonly response: unknown
  readonly _provider_metadata?: Record<string, unknown>
}

export interface ToolCallResult {
  readonly response: unknown
  readonly isError: boolean
}

/** Decoration for a tool call that spawned a subagent, keyed by tool-call id. */
export interface SubagentToolCallInfo {
  /** The subagent's display label (agent name or tool name). */
  readonly label: string
  /** The subagent's primary model, when known. */
  readonly model?: string | undefined
  /** A compact metrics summary (e.g. "$0.0012 · 3 gen"). */
  readonly statsLabel: string
  /** Opens the subagent's conversation in place. Absent renders no button. */
  readonly onOpenConversation?: (() => void) | undefined
}
