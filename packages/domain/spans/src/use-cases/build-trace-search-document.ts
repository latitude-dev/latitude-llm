import { type CryptoError, hash } from "@repo/utils"
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

function formatGenAIPart(part: GenAIPart): string {
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
      // Skip unsearchable part types (reasoning, tool_call_response) and any
      // unknown variants, rather than emitting placeholder tokens that only
      // add embedding noise. Reasoning content in particular can be large and
      // has low search value — paying Voyage to embed it isn't worth it.
      return ""
  }
}

function formatGenAIMessage(message: GenAIMessage): string {
  return message.parts
    .map((p) => formatGenAIPart(p))
    .join("\n")
    .trim()
}

/**
 * Group messages into "turns": each turn starts with a user message (or the
 * first non-system message if the conversation opens with the assistant), and
 * extends through the model's response and any tool-call/tool-response pairs
 * up to the next user message.
 *
 * System messages are filtered out entirely — they're prompts, not content.
 */
function extractTurns(messages: readonly GenAIMessage[]): string[] {
  const turns: string[][] = []
  let current: string[] | undefined

  for (const message of messages) {
    if (!message) continue
    if (message.role === "system") continue
    const text = formatGenAIMessage(message)
    if (!text) continue

    if (message.role === "user" || current === undefined) {
      current = [text]
      turns.push(current)
    } else {
      current.push(text)
    }
  }

  return turns.map((turn) => turn.join("\n").trim()).filter((t) => t.length > 0)
}

/**
 * Pick which turns get embedded when the conversation exceeds the per-trace
 * budget. Tail-first because the tail (resolution, handoff, final answer)
 * carries more retrieval signal than the head (user's framing).
 *
 * Both walks soft-cap on their boundary: the turn that crosses is still
 * included fully (atomic-turn rule), then the walk stops.
 */
function selectHeadTailTurns(turns: readonly string[]): string[] {
  const tailIndices = new Set<number>()
  let tailAccum = 0
  for (let i = turns.length - 1; i >= 0; i--) {
    if (tailAccum >= TRACE_SEARCH_CHUNK_TAIL_BUDGET_CHARS) break
    tailIndices.add(i)
    tailAccum += turns[i]!.length
  }

  const headIndices: number[] = []
  let headAccum = 0
  for (let i = 0; i < turns.length; i++) {
    if (tailIndices.has(i)) break
    if (headAccum >= TRACE_SEARCH_CHUNK_HEAD_BUDGET_CHARS) break
    headIndices.push(i)
    headAccum += turns[i]!.length
  }

  const sortedTail = [...tailIndices].sort((a, b) => a - b)
  return [...headIndices.map((i) => turns[i]!), ...sortedTail.map((i) => turns[i]!)]
}

interface ChunkPayload {
  readonly text: string
}

/**
 * Greedy-pack turns into chunks. A turn larger than the per-chunk cap splits
 * into overlapping pieces; smaller turns accumulate into one chunk until the
 * next turn would push it over the cap.
 */
function packChunks(turns: readonly string[]): ChunkPayload[] {
  const chunks: ChunkPayload[] = []
  const separator = "\n\n"
  let buffer = ""

  const flush = () => {
    const trimmed = buffer.trim()
    if (trimmed.length > 0) chunks.push({ text: trimmed })
    buffer = ""
  }

  for (const turn of turns) {
    if (turn.length > TRACE_SEARCH_CHUNK_MAX_CHARS) {
      flush()
      const stride = Math.max(1, TRACE_SEARCH_CHUNK_MAX_CHARS - TRACE_SEARCH_CHUNK_OVERLAP_CHARS)
      for (let i = 0; i < turn.length; i += stride) {
        const piece = turn.slice(i, i + TRACE_SEARCH_CHUNK_MAX_CHARS).trim()
        if (piece.length > 0) chunks.push({ text: piece })
        if (i + TRACE_SEARCH_CHUNK_MAX_CHARS >= turn.length) break
      }
      continue
    }

    const candidate = buffer ? `${buffer}${separator}${turn}` : turn
    if (candidate.length > TRACE_SEARCH_CHUNK_MAX_CHARS) {
      flush()
      buffer = turn
    } else {
      buffer = candidate
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
 * The document includes:
 *   - `searchText`: whole-trace conversation text for the lexical index, with
 *     head+tail middle-truncation when over `TRACE_SEARCH_DOCUMENT_MAX_LENGTH`.
 *   - `chunks`: per-turn embedding-shaped slices. Tail-first head+tail walks
 *     when over the per-trace budget; greedy multi-turn packing when under.
 *
 * Excludes:
 *   - System prompt text and system instructions.
 *   - Reasoning parts.
 *   - Tool-call response payloads.
 */
export const buildTraceSearchDocument = (
  input: TraceSearchDocumentInput,
): Effect.Effect<TraceSearchDocument, CryptoError> =>
  Effect.gen(function* () {
    const turns = extractTurns(input.messages)
    const totalLength = turns.reduce((sum, t) => sum + t.length, 0)

    const selectedTurns = totalLength <= TRACE_SEARCH_DOCUMENT_MAX_LENGTH ? [...turns] : selectHeadTailTurns(turns)

    const wholeTraceText = turns.join("\n\n")
    const searchText = normalizeSearchText(wholeTraceText)
    const contentHash = yield* hash(`${input.traceId}\0${searchText}`)

    const packed = packChunks(selectedTurns)
    const chunks: TraceSearchChunk[] = []
    for (let i = 0; i < packed.length; i++) {
      const text = normalizeChunkText(packed[i]!.text)
      if (text.length === 0) continue
      const chunkHash = yield* hash(`${input.traceId}\0${i}\0${text}`)
      chunks.push({ chunkIndex: i, text, contentHash: chunkHash })
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
