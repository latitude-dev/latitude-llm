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
      return "[TOOL RESULT]"
    default:
      return `[${String((part as { type: string }).type)}]`
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

/**
 * Computes a deterministic content hash for the search document.
 * Used to skip redundant embedding work when content hasn't changed.
 */
function computeContentHash(traceId: string, searchText: string): string {
  // Simple hash: traceId + length prefix of content
  // This is deterministic and changes when content changes
  const contentPrefix = searchText.slice(0, 1000)
  const contentLength = searchText.length

  // Use a simple string combination that changes with content
  // In production, a proper hash function would be used
  return `${traceId}:${contentLength}:${hashString(contentPrefix)}`
}

/**
 * Simple string hash function for content hashing.
 * Returns a 32-character hex-like string.
 */
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }

  // Convert to positive hex string and pad to 32 chars
  const hashHex = Math.abs(hash).toString(16).padStart(8, "0")
  // Repeat to get 32 chars (simplified approach)
  return (hashHex + hashHex + hashHex + hashHex).slice(0, 32)
}

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
export function buildTraceSearchDocument(input: TraceSearchDocumentInput): TraceSearchDocument {
  // Extract text from input and output messages
  const inputText = extractMessageText(input.inputMessages)
  const outputText = extractMessageText(input.outputMessages)

  // Combine with root span name as a metadata boost
  const parts: string[] = []

  if (input.rootSpanName && input.rootSpanName !== "") {
    parts.push(input.rootSpanName)
  }

  if (inputText) {
    parts.push(inputText)
  }

  if (outputText) {
    parts.push(outputText)
  }

  const rawText = parts.join("\n\n")
  const searchText = normalizeSearchText(rawText)
  const contentHash = computeContentHash(input.traceId, searchText)

  return {
    traceId: input.traceId,
    startTime: input.startTime,
    rootSpanName: input.rootSpanName,
    searchText,
    contentHash,
  }
}
