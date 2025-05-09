export type ToolResultPart = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

export type ToolCallPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown
}
