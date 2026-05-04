import { SpanId, type SpanId as SpanIdBrand } from "@domain/shared"
import type { GenAIMessage } from "rosetta-ai"
import type { Span } from "../entities/span.ts"
import type { SpanMessagesData } from "../ports/span-repository.ts"
import { buildConversationSpanMaps } from "../use-cases/map-conversation-to-spans.ts"
import { resolveLastLlmCompletionSpanId } from "./resolve-last-llm-completion-span.ts"

export type AnnotationWriteSpanAnchor = {
  readonly messageIndex?: number | undefined
  readonly partIndex?: number | undefined
}

/**
 * Resolves which span an annotation should attach to when the client did not send `spanId`.
 *
 * Text selections on tool call / tool result parts must use the `execute_tool` span (via
 * `toolCallSpanMap`), not the latest LLM completion — otherwise the annotation appears on the wrong
 * span in the trace UI (LAT-547).
 */
export function resolveAnnotationSpanIdForWrite(input: {
  readonly allMessages: readonly GenAIMessage[]
  readonly spanMessages: readonly SpanMessagesData[]
  readonly llmSpans: readonly Span[]
  readonly anchor: AnnotationWriteSpanAnchor | undefined
}): SpanIdBrand | undefined {
  const { messageIndex, partIndex } = input.anchor ?? {}
  if (messageIndex !== undefined && partIndex !== undefined) {
    const { toolCallSpanMap } = buildConversationSpanMaps(input.allMessages, input.spanMessages)
    const msg = input.allMessages[messageIndex]
    const part = msg?.parts[partIndex]
    if (part?.type === "tool_call") {
      const id = typeof (part as { id?: unknown }).id === "string" ? (part as { id: string }).id.trim() : ""
      if (id && toolCallSpanMap[id]) return SpanId(toolCallSpanMap[id])
    }
    if (part?.type === "tool_call_response") {
      const id = typeof (part as { id?: unknown }).id === "string" ? (part as { id: string }).id.trim() : ""
      if (id && toolCallSpanMap[id]) return SpanId(toolCallSpanMap[id])
    }
  }
  return resolveLastLlmCompletionSpanId(input.llmSpans)
}
