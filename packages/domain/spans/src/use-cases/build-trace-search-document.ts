import { type CryptoError, hash, safeStringifyJson } from "@repo/utils"
import { Effect } from "effect"
import type { GenAIMessage, GenAIPart } from "rosetta-ai"
import {
  TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS,
  TRACE_SEARCH_CHUNK_MAX_CHARS,
  TRACE_SEARCH_CHUNK_OVERLAP_CHARS,
  TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS,
  TRACE_SEARCH_DOCUMENT_MAX_LENGTH,
} from "../constants.ts"

export interface TraceSearchDocumentInput {
  readonly traceId: string
  readonly startTime: Date
  readonly rootSpanName: string
  readonly messages: readonly GenAIMessage[]
}

/** One embedding-shaped slice of the conversation. */
export interface TraceSearchChunk {
  readonly chunkIndex: number
  readonly text: string
  readonly contentHash: string
  readonly firstMessageIndex: number
  readonly lastMessageIndex: number
}

export interface TraceSearchDocument {
  readonly traceId: string
  readonly startTime: Date
  readonly rootSpanName: string
  /** Whole-trace text used for the lexical text-index document. */
  readonly searchText: string
  /** Whole-trace content hash used for whole-trace dedup of the lexical row. */
  readonly contentHash: string
  /** Per-chunk slices used for the semantic embedding rows. */
  readonly chunks: readonly TraceSearchChunk[]
}

function formatCommonPart(part: GenAIPart): string {
  switch (part.type) {
    case "text":
      return typeof part.content === "string" ? part.content : ""
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
      return ""
  }
}

// Embedding skips reasoning + tool_call_response (Voyage cost / signal dilution).
function formatPartForEmbedding(part: GenAIPart): string {
  return formatCommonPart(part)
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
  return message.parts
    .map((p) => formatter(p))
    .join("\n")
    .trim()
}

interface ExtractedTurn {
  readonly text: string
  readonly firstMessageIndex: number
  readonly lastMessageIndex: number
}

/**
 * Group messages into "turns": each turn starts with a user message (or the
 * first non-system message if the conversation opens with the assistant), and
 * extends through the model's response and any tool-call/tool-response pairs
 * up to the next user message.
 *
 * System messages are filtered out of the turn text but their positions are
 * preserved in `allMessages`, so `firstMessageIndex` / `lastMessageIndex` may
 * span over a system row (e.g. a `system,user,assistant` prefix yields one
 * turn with `firstMessageIndex: 1` and `lastMessageIndex: 2`).
 */
function extractTurns(messages: readonly GenAIMessage[], formatter: (p: GenAIPart) => string): ExtractedTurn[] {
  const turns: { texts: string[]; firstMessageIndex: number; lastMessageIndex: number }[] = []
  let current: { texts: string[]; firstMessageIndex: number; lastMessageIndex: number } | undefined

  messages.forEach((message, messageIndex) => {
    if (!message) return
    if (message.role === "system") return
    const text = formatMessage(message, formatter)
    if (!text) return

    if (message.role === "user" || current === undefined) {
      current = { texts: [text], firstMessageIndex: messageIndex, lastMessageIndex: messageIndex }
      turns.push(current)
    } else {
      current.texts.push(text)
      current.lastMessageIndex = messageIndex
    }
  })

  return turns
    .map((turn) => ({
      text: turn.texts.join("\n").trim(),
      firstMessageIndex: turn.firstMessageIndex,
      lastMessageIndex: turn.lastMessageIndex,
    }))
    .filter((t) => t.text.length > 0)
}

/**
 * Pick which turns get embedded when the conversation exceeds the per-trace
 * budget. Tail-first because the tail (resolution, handoff, final answer)
 * carries more retrieval signal than the head (user's framing).
 *
 * Both walks soft-cap on their boundary: the turn that crosses is still
 * included fully (atomic-turn rule), then the walk stops.
 */
function selectHeadTailTurns(turns: readonly ExtractedTurn[]): ExtractedTurn[] {
  const tailIndices = new Set<number>()
  let tailAccum = 0
  for (let i = turns.length - 1; i >= 0; i--) {
    if (tailAccum >= TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS) break
    tailIndices.add(i)
    tailAccum += turns[i]!.text.length
  }

  const headIndices: number[] = []
  let headAccum = 0
  for (let i = 0; i < turns.length; i++) {
    if (tailIndices.has(i)) break
    if (headAccum >= TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS) break
    headIndices.push(i)
    headAccum += turns[i]!.text.length
  }

  const sortedTail = [...tailIndices].sort((a, b) => a - b)
  return [...headIndices.map((i) => turns[i]!), ...sortedTail.map((i) => turns[i]!)]
}

interface ChunkPayload {
  readonly text: string
  readonly firstMessageIndex: number
  readonly lastMessageIndex: number
}

/**
 * Greedy-pack turns into chunks. A turn larger than the per-chunk cap splits
 * into overlapping pieces; smaller turns accumulate into one chunk until the
 * next turn would push it over the cap.
 *
 * Each emitted chunk carries the **union** of the message ranges of every
 * turn that contributed to it. Sub-chunks of one oversized turn inherit that
 * turn's full range (turns are atomic for the mapping) so every sub-chunk
 * maps to the same conversational region.
 */
function packChunks(turns: readonly ExtractedTurn[]): ChunkPayload[] {
  const chunks: ChunkPayload[] = []
  const separator = "\n\n"
  let buffer = ""
  let bufferFirst = -1
  let bufferLast = -1

  const flush = () => {
    const trimmed = buffer.trim()
    if (trimmed.length > 0 && bufferFirst >= 0) {
      chunks.push({ text: trimmed, firstMessageIndex: bufferFirst, lastMessageIndex: bufferLast })
    }
    buffer = ""
    bufferFirst = -1
    bufferLast = -1
  }

  for (const turn of turns) {
    if (turn.text.length > TRACE_SEARCH_CHUNK_MAX_CHARS) {
      flush()
      const stride = Math.max(1, TRACE_SEARCH_CHUNK_MAX_CHARS - TRACE_SEARCH_CHUNK_OVERLAP_CHARS)
      for (let i = 0; i < turn.text.length; i += stride) {
        const piece = turn.text.slice(i, i + TRACE_SEARCH_CHUNK_MAX_CHARS).trim()
        if (piece.length > 0) {
          chunks.push({
            text: piece,
            firstMessageIndex: turn.firstMessageIndex,
            lastMessageIndex: turn.lastMessageIndex,
          })
        }
        if (i + TRACE_SEARCH_CHUNK_MAX_CHARS >= turn.text.length) break
      }
      continue
    }

    const candidate = buffer ? `${buffer}${separator}${turn.text}` : turn.text
    if (candidate.length > TRACE_SEARCH_CHUNK_MAX_CHARS) {
      flush()
      buffer = turn.text
      bufferFirst = turn.firstMessageIndex
      bufferLast = turn.lastMessageIndex
    } else {
      buffer = candidate
      bufferFirst = bufferFirst < 0 ? turn.firstMessageIndex : Math.min(bufferFirst, turn.firstMessageIndex)
      bufferLast = Math.max(bufferLast, turn.lastMessageIndex)
    }
  }
  flush()

  return chunks
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

function normalizeChunkText(text: string): string {
  // Chunks aren't middle-truncated — they're already bounded by
  // TRACE_SEARCH_CHUNK_MAX_CHARS and middle-truncating would corrupt the
  // sliced piece on already-split long turns.
  return stripLoneSurrogates(normalizeWhitespace(text))
}

/**
 * Builds a canonical search document from trace data.
 *
 * `searchText` (lexical) and `chunks` (embedding) both exclude system
 * messages. The lexical text also includes reasoning + stringified tool
 * responses; the embedding text does not — see formatters above.
 */
export const buildTraceSearchDocument = (
  input: TraceSearchDocumentInput,
): Effect.Effect<TraceSearchDocument, CryptoError> =>
  Effect.gen(function* () {
    const lexicalTurns = extractTurns(input.messages, formatPartForLexical)
    const wholeTraceText = lexicalTurns.map((t) => t.text).join("\n\n")
    const searchText = normalizeSearchText(wholeTraceText)
    const contentHash = yield* hash(`${input.traceId}\0${searchText}`)

    const embeddingTurns = extractTurns(input.messages, formatPartForEmbedding)
    const totalEmbeddingLength = embeddingTurns.reduce((sum, t) => sum + t.text.length, 0)
    const selectedTurns =
      totalEmbeddingLength <= TRACE_SEARCH_DOCUMENT_MAX_LENGTH
        ? [...embeddingTurns]
        : selectHeadTailTurns(embeddingTurns)

    const packed = packChunks(selectedTurns)
    const chunks: TraceSearchChunk[] = []
    for (let i = 0; i < packed.length; i++) {
      const payload = packed[i]!
      const text = normalizeChunkText(payload.text)
      if (text.length === 0) continue
      const chunkHash = yield* hash(`${input.traceId}\0${i}\0${text}`)
      chunks.push({
        chunkIndex: i,
        text,
        contentHash: chunkHash,
        firstMessageIndex: payload.firstMessageIndex,
        lastMessageIndex: payload.lastMessageIndex,
      })
    }

    return {
      traceId: input.traceId,
      startTime: input.startTime,
      rootSpanName: input.rootSpanName,
      searchText,
      contentHash,
      chunks,
    }
  })
