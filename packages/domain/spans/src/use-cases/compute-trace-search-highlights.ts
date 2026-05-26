import { safeStringifyJson } from "@repo/utils"
import type { GenAIMessage } from "rosetta-ai"
import { normalizeLiteralPhrase } from "../helpers/normalize-literal-phrase.ts"
import { tokenizePhrase } from "../helpers/tokenize-phrase.ts"
import type { TraceSemanticHighlightMatch } from "../ports/trace-search-repository.ts"
import type { ParsedSearchQuery } from "./parse-search-query.ts"

export interface TraceHighlight {
  readonly messageIndex: number
  readonly partIndex: number
  readonly startOffset: number
  readonly endOffset: number
  readonly type: "search-literal" | "search-token" | "search-semantic-region" | "search-container"
  readonly source:
    | { kind: "literal"; phrase: string }
    | { kind: "token"; phrase: string; matchedTokens: readonly string[] }
    | { kind: "semantic-region"; chunkIndex: number; score: number }
    // Presence-only marker for parts the renderer can't anchor inline chips on.
    | { kind: "container"; partType: "tool_call_response"; phrases: readonly string[] }
}

export interface TraceSearchHighlightsResult {
  readonly highlights: readonly TraceHighlight[]
  /** Index into `highlights` of the first match in document order, or -1. */
  readonly firstMatchIndex: number
}

const REGEX_META_RE = /[\\^$.*+?()[\]{}|]/g

function escapeRegex(text: string): string {
  return text.replace(REGEX_META_RE, "\\$&")
}

function findLiteralPhraseHits(content: string, normalizedPhrase: string): readonly { start: number; end: number }[] {
  if (normalizedPhrase.length === 0) return []

  const pieces = normalizedPhrase.split(" ").map(escapeRegex)
  const pattern = pieces.join("\\s+")
  const re = new RegExp(pattern, "g")

  const hits: { start: number; end: number }[] = []
  let m: RegExpExecArray | null = re.exec(content)
  while (m !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1
    } else {
      hits.push({ start: m.index, end: m.index + m[0].length })
    }
    m = re.exec(content)
  }
  return hits
}

function findTokenPhraseHits(
  content: string,
  phraseTokens: readonly string[],
): readonly { start: number; end: number }[] {
  if (phraseTokens.length === 0) return []

  const sourceTokens: { text: string; start: number; end: number }[] = []
  const re = /[A-Za-z0-9]+/g
  let m: RegExpExecArray | null = re.exec(content)
  while (m !== null) {
    sourceTokens.push({
      text: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    })
    m = re.exec(content)
  }

  const hits: { start: number; end: number }[] = []
  for (let i = 0; i + phraseTokens.length <= sourceTokens.length; i++) {
    let allMatch = true
    for (let j = 0; j < phraseTokens.length; j++) {
      if (sourceTokens[i + j]?.text !== phraseTokens[j]) {
        allMatch = false
        break
      }
    }
    if (allMatch) {
      const first = sourceTokens[i]
      const last = sourceTokens[i + phraseTokens.length - 1]
      if (first && last) hits.push({ start: first.start, end: last.end })
    }
  }
  return hits
}

const EMPTY_RESULT: TraceSearchHighlightsResult = { highlights: [], firstMatchIndex: -1 }

function emitTextHighlights(args: {
  readonly content: string
  readonly messageIndex: number
  readonly partIndex: number
  readonly normalizedLiterals: readonly { phrase: string; normalized: string }[]
  readonly tokenizedPhrases: readonly { phrase: string; tokens: readonly string[] }[]
  readonly highlights: TraceHighlight[]
}): void {
  const { content, messageIndex, partIndex, normalizedLiterals, tokenizedPhrases, highlights } = args
  for (const { phrase, normalized } of normalizedLiterals) {
    const literalHits = findLiteralPhraseHits(content, normalized)
    for (const hit of literalHits) {
      highlights.push({
        messageIndex,
        partIndex,
        startOffset: hit.start,
        endOffset: hit.end,
        type: "search-literal",
        source: { kind: "literal", phrase },
      })
    }
  }

  for (const { phrase, tokens } of tokenizedPhrases) {
    const tokenHits = findTokenPhraseHits(content, tokens)
    for (const hit of tokenHits) {
      highlights.push({
        messageIndex,
        partIndex,
        startOffset: hit.start,
        endOffset: hit.end,
        type: "search-token",
        source: { kind: "token", phrase, matchedTokens: tokens },
      })
    }
  }
}

// Pure: walks allMessages, emits inline chips for text + reasoning, container
// markers for matching tool_call_response, and a semantic-region range for
// the message span of the winning chunk (when `semanticMatch` is provided).
// System messages are skipped (matches what the lexical index ingests).
// Matches mirror the lexical search plan: any literal that normalizes to
// empty OR any token phrase that tokenizes to empty yields zero highlights.
export function computeTraceSearchHighlights(args: {
  readonly messages: readonly GenAIMessage[]
  readonly parsedQuery: ParsedSearchQuery
  readonly semanticMatch?: TraceSemanticHighlightMatch | null
}): TraceSearchHighlightsResult {
  const { messages, parsedQuery, semanticMatch } = args
  const { literalPhrases, tokenPhrases } = parsedQuery

  const hasPhrases = literalPhrases.length > 0 || tokenPhrases.length > 0
  const semanticRegion =
    semanticMatch && semanticMatch.firstMessageIndex !== null && semanticMatch.lastMessageIndex !== null
      ? {
          chunkIndex: semanticMatch.chunkIndex,
          firstMessageIndex: semanticMatch.firstMessageIndex,
          lastMessageIndex: semanticMatch.lastMessageIndex,
          score: semanticMatch.relevanceScore,
        }
      : null

  if (!hasPhrases && semanticRegion === null) {
    return EMPTY_RESULT
  }

  const normalizedLiterals = literalPhrases.map((phrase) => ({ phrase, normalized: normalizeLiteralPhrase(phrase) }))
  const tokenizedPhrases = tokenPhrases.map((phrase) => ({ phrase, tokens: tokenizePhrase(phrase) }))

  if (hasPhrases) {
    const matchesNothing =
      normalizedLiterals.some(({ normalized }) => normalized.length === 0) ||
      tokenizedPhrases.some(({ tokens }) => tokens.length === 0)
    if (matchesNothing) return EMPTY_RESULT
  }

  const highlights: TraceHighlight[] = []

  // conversation.tsx absorbs tool_call_response into the calling assistant's
  // ToolCallBlock, so the marker has to anchor at the tool_call part to land
  // on visible DOM. Orphan responses fall back to their own location.
  const toolCallLocations = new Map<string, { messageIndex: number; partIndex: number }>()
  messages.forEach((message, messageIndex) => {
    if (!message?.parts) return
    message.parts.forEach((part, partIndex) => {
      if (part.type !== "tool_call") return
      const id = (part as { id?: unknown }).id
      if (typeof id !== "string" || id.length === 0) return
      toolCallLocations.set(id, { messageIndex, partIndex })
    })
  })

  messages.forEach((message, messageIndex) => {
    if (!message || message.role === "system") return
    if (!message.parts) return

    if (
      semanticRegion !== null &&
      messageIndex >= semanticRegion.firstMessageIndex &&
      messageIndex <= semanticRegion.lastMessageIndex
    ) {
      highlights.push({
        messageIndex,
        partIndex: 0,
        startOffset: 0,
        endOffset: 0,
        type: "search-semantic-region",
        source: {
          kind: "semantic-region",
          chunkIndex: semanticRegion.chunkIndex,
          score: semanticRegion.score,
        },
      })
    }

    message.parts.forEach((part, partIndex) => {
      // text + reasoning both render via <MarkdownContent>, so character
      // offsets work as inline-chip anchors.
      if (part.type === "text" || part.type === "reasoning") {
        const content = typeof part.content === "string" ? part.content : ""
        if (content.length === 0) return
        emitTextHighlights({
          content,
          messageIndex,
          partIndex,
          normalizedLiterals,
          tokenizedPhrases,
          highlights,
        })
        return
      }

      // Renderer's pretty-printed JSON doesn't align with the indexer's
      // stringification → emit a presence-only marker, not character offsets.
      if (part.type === "tool_call_response") {
        const response = (part as { response?: unknown }).response
        const responseText = safeStringifyJson(response)
        if (responseText.length === 0) return

        const matchedPhrases: string[] = []
        for (const { phrase, normalized } of normalizedLiterals) {
          if (findLiteralPhraseHits(responseText, normalized).length > 0) matchedPhrases.push(phrase)
        }
        for (const { phrase, tokens } of tokenizedPhrases) {
          if (findTokenPhraseHits(responseText, tokens).length > 0) matchedPhrases.push(phrase)
        }
        if (matchedPhrases.length === 0) return

        const responseId = (part as { id?: unknown }).id
        const anchor = typeof responseId === "string" ? (toolCallLocations.get(responseId) ?? null) : null
        const anchorMessageIndex = anchor?.messageIndex ?? messageIndex
        const anchorPartIndex = anchor?.partIndex ?? partIndex

        highlights.push({
          messageIndex: anchorMessageIndex,
          partIndex: anchorPartIndex,
          startOffset: 0,
          endOffset: 0,
          type: "search-container",
          source: { kind: "container", partType: "tool_call_response", phrases: matchedPhrases },
        })
      }
    })
  })

  highlights.sort((a, b) => {
    if (a.messageIndex !== b.messageIndex) return a.messageIndex - b.messageIndex
    if (a.partIndex !== b.partIndex) return a.partIndex - b.partIndex
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
    return a.endOffset - b.endOffset
  })

  return {
    highlights,
    firstMatchIndex: highlights.length > 0 ? 0 : -1,
  }
}
