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
