import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import type { GenAIMessage, GenAIPart } from "rosetta-ai"
import { TRACE_SEARCH_DOCUMENT_MAX_LENGTH } from "../constants.ts"

export interface TraceSearchDocumentInput {
  readonly traceId: string
  readonly startTime: Date
  readonly rootSpanName: string
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
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
    case "tool_call_response":
      // Skip tool result content entirely. The tool output text (JSON, errors, etc.)
      // is not searchable in any meaningful way and leaving a literal "[TOOL RESULT]"
      // placeholder only added noise to embeddings without improving retrieval.
      return ""
    default:
      // Unknown part types are skipped rather than labeled. Emitting a
      // `[<type>]` placeholder for parts we haven't modeled just feeds
      // arbitrary tokens into embeddings and muddles retrieval signal.
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
 * Extracts searchable text from GenAI messages.
 * Includes user input and assistant output messages.
 * Excludes system prompts entirely.
 */
function extractMessageText(messages: readonly GenAIMessage[]): string {
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

/**
 * Normalizes text for search indexing:
 * - Trims whitespace
 * - Collapses multiple whitespace characters
 * - Truncates to max length
 */
function normalizeSearchText(text: string): string {
  // Trim and collapse whitespace
  let normalized = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")

  // Truncate to max length
  if (normalized.length > TRACE_SEARCH_DOCUMENT_MAX_LENGTH) {
    normalized = normalized.slice(0, TRACE_SEARCH_DOCUMENT_MAX_LENGTH)
  }

  return normalized
}

// SHA-256 hex digest (64 chars) from @repo/utils; matches the FixedString(64) column width.
const computeContentHash = (traceId: string, searchText: string): Effect.Effect<string, CryptoError> =>
  hash(`${traceId}\0${searchText}`)

/**
 * Builds a canonical search document from trace data.
 *
 * The document includes:
 * - User input messages
 * - Assistant output messages
 * - Root span name as metadata
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
    const inputText = extractMessageText(input.inputMessages)
    const outputText = extractMessageText(input.outputMessages)

    const parts: string[] = []
    if (input.rootSpanName && input.rootSpanName !== "") parts.push(input.rootSpanName)
    if (inputText) parts.push(inputText)
    if (outputText) parts.push(outputText)

    const searchText = normalizeSearchText(parts.join("\n\n"))
    const contentHash = yield* computeContentHash(input.traceId, searchText)

    return {
      traceId: input.traceId,
      startTime: input.startTime,
      rootSpanName: input.rootSpanName,
      searchText,
      contentHash,
    }
  })
