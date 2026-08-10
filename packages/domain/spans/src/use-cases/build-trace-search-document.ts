import { type CryptoError, hash, resolveContentModality, safeStringifyJson } from "@repo/utils"
import { Effect } from "effect"
import type { GenAIMessage, GenAIPart } from "rosetta-ai"
import { TRACE_SEARCH_DOCUMENT_MAX_LENGTH } from "../constants.ts"
import type { MessageEmbeddingRole } from "../helpers/message-embedding.ts"

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
  /** Whole-trace text used for the lexical text-index document. */
  readonly searchText: string
  /** Whole-trace content hash used for whole-trace dedup of the lexical row. */
  readonly contentHash: string
}

function formatCommonPart(part: GenAIPart): string {
  switch (part.type) {
    case "text":
      return typeof part.content === "string" ? part.content : ""
    case "blob": {
      const mimeType = typeof part.mime_type === "string" ? part.mime_type : null
      const modality = resolveContentModality(String(part.modality), mimeType)
      if (modality === "image") return "[IMAGE]"
      if (modality === "video") return "[VIDEO]"
      if (modality === "audio") return "[AUDIO]"
      return `[BLOB:${modality}]`
    }
    case "file":
      return `[FILE:${part.file_id}]`
    case "uri":
      return typeof part.uri === "string" ? `[URI:${part.uri}]` : "[URI]"
    case "tool_call":
      return `[TOOL CALL: ${part.name}]`
    default:
      return ""
  }
}

function formatPartForMessageEmbedding(part: GenAIPart): string {
  const record = part as Record<string, unknown>
  if (part.type === "reasoning") return ""
  if (typeof record.content === "string") return record.content
  if (part.type === "tool_call" && typeof part.name === "string") return `[TOOL CALL: ${part.name}]`
  if (part.type === "tool_call_response") return typeof record.response === "string" ? record.response : "[TOOL RESULT]"
  return ""
}

// Lexical includes them — ClickHouse text storage is free, and a user
// searching for content the model only emitted in reasoning or a tool
// response should still find the trace.
function formatPartForLexical(part: GenAIPart): string {
  if (part.type === "reasoning") {
    return typeof part.content === "string" ? part.content : ""
  }
  if (part.type === "tool_call_response") {
    return safeStringifyJson(part.response)
  }
  return formatCommonPart(part)
}

function formatMessage(message: GenAIMessage, formatter: (p: GenAIPart) => string): string {
  return (message.parts ?? [])
    .map((p) => formatter(p))
    .join("\n")
    .trim()
}

const roleOf = (message: GenAIMessage): MessageEmbeddingRole => {
  if (message.role === "user" || message.role === "assistant" || message.role === "tool" || message.role === "system") {
    return message.role
  }
  return "unknown"
}

const stripToolTelemetry = (content: string): string =>
  content
    .split("\n")
    .filter((line) => !line.trim().startsWith("[TOOL CALL:") && line.trim() !== "[TOOL RESULT]")
    .join("\n")
    .trim()

export interface TraceSearchEmbeddingMessage {
  readonly index: number
  readonly role: MessageEmbeddingRole
  readonly text: string
}

export const isTraceSearchSemanticMessage = (message: { readonly role: MessageEmbeddingRole }): boolean =>
  message.role === "user" || message.role === "assistant"

export const extractTraceSearchEmbeddingMessages = (
  messages: readonly GenAIMessage[],
): readonly TraceSearchEmbeddingMessage[] =>
  messages
    .map((message, index) => ({
      index,
      role: roleOf(message),
      text: stripToolTelemetry(formatMessage(message, formatPartForMessageEmbedding)),
    }))
    .filter((message) => message.text.length > 0)

function extractSearchText(messages: readonly GenAIMessage[], formatter: (p: GenAIPart) => string): string {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => formatMessage(message, formatter))
    .filter((text) => text.length > 0)
    .join("\n\n")
}

function truncateMiddle(text: string): string {
  if (text.length <= TRACE_SEARCH_DOCUMENT_MAX_LENGTH) return text

  const marker = "\n\n[... trace search omitted middle ...]\n\n"
  const remainingLength = TRACE_SEARCH_DOCUMENT_MAX_LENGTH - marker.length
  const headLength = Math.floor(remainingLength / 2)
  const tailLength = remainingLength - headLength

  return `${text.slice(0, headLength)}${marker}${text.slice(-tailLength)}`
}

// JS strings are UTF-16 and may contain unpaired surrogates — either from
// malformed input or from a code-unit slice that split a surrogate pair.
// ClickHouse's strict JSON parser rejects them ("missing second part of
// surrogate pair"), so we replace any lone surrogate with U+FFFD before
// the document leaves this module.
function stripLoneSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�")
}

function normalizeWhitespace(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
}

function normalizeSearchText(text: string): string {
  return stripLoneSurrogates(truncateMiddle(normalizeWhitespace(text)))
}

/**
 * Builds a canonical search document from trace data.
 *
 * `searchText` excludes system messages and includes reasoning + stringified
 * tool responses so lexical search can find content that is not embedded.
 */
export const buildTraceSearchDocument = (
  input: TraceSearchDocumentInput,
): Effect.Effect<TraceSearchDocument, CryptoError> =>
  Effect.gen(function* () {
    const wholeTraceText = extractSearchText(input.messages, formatPartForLexical)
    const searchText = normalizeSearchText(wholeTraceText)
    const contentHash = yield* hash(`${input.traceId}\0${searchText}`)

    return {
      traceId: input.traceId,
      startTime: input.startTime,
      rootSpanName: input.rootSpanName,
      searchText,
      contentHash,
    }
  })
