import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import type { GenAIMessage, GenAIPart } from "rosetta-ai"
import { TRACE_SEARCH_DOCUMENT_MAX_LENGTH } from "../constants.ts"

export interface TraceSearchDocumentInput {
  readonly traceId: string
  readonly startTime: Date
  readonly rootSpanName: string
  readonly messages: readonly GenAIMessage[]
}

export interface TraceSearchDocument {
  readonly traceId: string
  readonly startTime: Date
  readonly rootSpanName: string
  readonly searchText: string
  readonly contentHash: string
}

/**
 * Formats a single GenAI part as text.
 */
function formatGenAIPart(part: GenAIPart): string {
  switch (part.type) {
    case "text":
      return typeof part.content === "string" ? part.content : ""
    case "reasoning": {
      const c = part.content
      return typeof c === "string" && c.trim() !== "" ? c : ""
    }
    case "blob": {
      if (part.modality === "image") return "[IMAGE]"
      if (part.modality === "video") return "[VIDEO]"
      if (part.modality === "audio") return "[AUDIO]"
      return `[BLOB:${String(part.modality)}]`
    }
    case "file":
      return `[FILE:${part.file_id}]`
    case "uri":
      return typeof part.uri === "string" ? `[URI:${part.uri}]` : "[URI]"
    case "tool_call":
      return `[TOOL CALL: ${part.name}]`
    default:
      // Skip unsearchable part types such as tool_call_response, and any
      // unknown variants, rather than emitting placeholder tokens that only
      // add embedding noise.
      return ""
  }
}

/**
 * Formats a GenAI message as text.
 */
function formatGenAIMessage(message: GenAIMessage): string {
  return message.parts
    .map((p) => formatGenAIPart(p))
    .join("\n")
    .trim()
}

/**
 * Extracts searchable text from the canonical conversation.
 * Includes user input and assistant output messages in order.
 * Excludes system prompts entirely.
 */
function extractConversationText(messages: readonly GenAIMessage[]): string {
  const parts: string[] = []

  for (const message of messages) {
    if (!message) continue

    // Only include user and assistant messages (not system)
    if (message.role === "user" || message.role === "assistant") {
      const text = formatGenAIMessage(message)
      if (text.trim()) {
        parts.push(text)
      }
    }
  }

  return parts.join("\n\n")
}

function truncateMiddle(text: string): string {
  if (text.length <= TRACE_SEARCH_DOCUMENT_MAX_LENGTH) return text

  const marker = "\n\n[... trace search omitted middle ...]\n\n"
  const remainingLength = TRACE_SEARCH_DOCUMENT_MAX_LENGTH - marker.length
  const headLength = Math.floor(remainingLength / 2)
  const tailLength = remainingLength - headLength

  return `${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`
}

/**
 * Normalizes text for search indexing:
 * - Trims whitespace
 * - Collapses multiple whitespace characters
 * - Truncates oversized conversations by keeping the beginning and end
 */
function normalizeSearchText(text: string): string {
  // Trim and collapse whitespace
  const normalized = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")

  return truncateMiddle(normalized)
}

/**
 * Builds a canonical search document from trace data.
 *
 * The document includes:
 * - Canonical conversation user input and assistant output messages
 *
 * The document excludes:
 * - System prompt text
 * - System instructions
 *
 * The resulting text is normalized and truncated before storage.
 */
export const buildTraceSearchDocument = (
  input: TraceSearchDocumentInput,
): Effect.Effect<TraceSearchDocument, CryptoError> =>
  Effect.gen(function* () {
    const searchText = normalizeSearchText(extractConversationText(input.messages))
    const contentHash = yield* hash(`${input.traceId}\0${searchText}`)

    return {
      traceId: input.traceId,
      startTime: input.startTime,
      rootSpanName: input.rootSpanName,
      searchText,
      contentHash,
    }
  })
