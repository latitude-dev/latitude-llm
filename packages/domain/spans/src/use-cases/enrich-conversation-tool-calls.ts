import type { GenAIMessage } from "rosetta-ai"
import type { SpanMessagesData } from "../ports/span-repository.ts"
import { buildConversationSpanMaps } from "./map-conversation-to-spans.ts"

type ToolCallPart = {
  readonly type: "tool_call"
  readonly id?: string | null
  readonly name?: string
  readonly arguments?: unknown
}

type ToolResponsePart = {
  readonly type: "tool_call_response"
  readonly id?: string | null
  readonly response?: unknown
  readonly result?: unknown
}

function parseToolPayload(raw: string): unknown | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

function isEmptyToolArgs(args: unknown): boolean {
  if (args === undefined || args === null) return true
  if (typeof args === "object" && !Array.isArray(args) && Object.keys(args).length === 0) return true
  return false
}

function collectResponseIds(messages: readonly GenAIMessage[]): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.role !== "tool") continue
    for (const part of message.parts ?? []) {
      if (part.type !== "tool_call_response") continue
      const id = (part as ToolResponsePart).id
      if (typeof id === "string" && id.length > 0) ids.add(id)
    }
  }
  return ids
}

function toolDataByCallId(
  messages: readonly GenAIMessage[],
  spans: readonly SpanMessagesData[],
): Map<string, { input: unknown; output: unknown }> {
  const { toolCallSpanMap } = buildConversationSpanMaps(messages, spans)
  const spanById = new Map(spans.map((span) => [span.spanId as string, span]))
  const data = new Map<string, { input: unknown; output: unknown }>()

  for (const [toolCallId, spanId] of Object.entries(toolCallSpanMap)) {
    const span = spanById.get(spanId)
    if (!span) continue
    const input = parseToolPayload(span.toolInput)
    const output = parseToolPayload(span.toolOutput)
    if (input !== undefined || output !== undefined) {
      data.set(toolCallId, { input: input ?? {}, output: output ?? null })
    }
  }

  for (const span of spans) {
    if (span.operation !== "execute_tool" || !span.toolCallId) continue
    if (data.has(span.toolCallId)) continue
    const input = parseToolPayload(span.toolInput)
    const output = parseToolPayload(span.toolOutput)
    if (input !== undefined || output !== undefined) {
      data.set(span.toolCallId, { input: input ?? {}, output: output ?? null })
    }
  }

  return data
}

function enrichAssistantMessage(
  message: GenAIMessage,
  toolData: ReadonlyMap<string, { input: unknown; output: unknown }>,
): GenAIMessage {
  const parts = message.parts ?? []
  let changed = false
  const nextParts = parts.map((part) => {
    if (part.type !== "tool_call") return part
    const call = part as ToolCallPart
    const id = call.id ?? undefined
    const payload = id ? toolData.get(id) : undefined
    if (!payload || !isEmptyToolArgs(call.arguments)) return part
    if (payload.input === undefined) return part
    changed = true
    return { ...call, arguments: payload.input }
  })
  return changed ? { ...message, parts: nextParts } : message
}

function syntheticToolResponse(toolCallId: string, output: unknown): GenAIMessage {
  return {
    role: "tool",
    parts: [{ type: "tool_call_response", id: toolCallId, response: output }],
  }
}

/** Fills missing tool_call arguments and tool results from execute_tool span I/O. */
export function enrichConversationToolCalls(
  messages: readonly GenAIMessage[],
  spans: readonly SpanMessagesData[],
): GenAIMessage[] {
  if (messages.length === 0 || spans.length === 0) return [...messages]

  const toolData = toolDataByCallId(messages, spans)
  if (toolData.size === 0) return [...messages]

  const responseIds = collectResponseIds(messages)
  const enriched: GenAIMessage[] = []

  for (const message of messages) {
    if (!message) continue
    if (message.role === "assistant") {
      const next = enrichAssistantMessage(message, toolData)
      enriched.push(next)
      for (const part of next.parts ?? []) {
        if (part.type !== "tool_call") continue
        const call = part as ToolCallPart
        const id = call.id ?? undefined
        if (!id || responseIds.has(id)) continue
        const payload = toolData.get(id)
        if (payload?.output === undefined || payload.output === null) continue
        enriched.push(syntheticToolResponse(id, payload.output))
        responseIds.add(id)
      }
      continue
    }
    enriched.push(message)
  }

  return enriched
}
