import type { GenAIMessage } from "rosetta-ai"
import { normalizeLiteralPhrase } from "../helpers/normalize-literal-phrase.ts"
import { tokenizePhrase } from "../helpers/tokenize-phrase.ts"
import type { ParsedSearchQuery } from "./parse-search-query.ts"

export interface TraceHighlight {
  readonly messageIndex: number
  readonly partIndex: number
  readonly startOffset: number
  readonly endOffset: number
  readonly type: "search-literal" | "search-token" | "search-semantic-region"
  readonly source:
    | { kind: "literal"; phrase: string }
    | { kind: "token"; phrase: string; matchedTokens: readonly string[] }
    | { kind: "semantic-region"; chunkIndex: number; score: number }
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

/**
 * Compute search-highlight ranges for a trace's conversation.
 *
 * Pure function over `(allMessages, parsedQuery)` so the use-case is fully
 * testable without ClickHouse or React. The server boundary
 * (`getTraceSearchHighlights`) loads the trace detail and delegates here.
 *
 * Behavior:
 *   - System messages (`role === "system"`) are skipped — matches what the
 *     server search index does at ingest (system messages are filtered from
 *     `search_text`), so the drawer cannot show hits the server search itself
 *     would never return.
 *   - Only `type === "text"` parts with `string` content are scanned. Non-text
 *     parts (blobs, tool calls, files, URIs, reasoning) render in the UI but
 *     aren't part of the search index's character coordinate system, so we
 *     don't emit highlights for them.
 *   - **Match-nothing parity with the lexical search plan.** If any literal
 *     phrase normalises to empty OR any token phrase tokenises to empty, the
 *     whole result is empty — matching how `buildLexicalSearchSubquery` treats
 *     an empty phrase as a zero-row filter for the entire query, not as a
 *     filter to silently drop.
 *   - **Literal phrases** are normalised the same way the lexical indexer
 *     normalises them (trim + collapse whitespace + replace lone surrogates),
 *     then matched against the raw part text with each single space in the
 *     normalised phrase allowed to span any whitespace run (`\s+`). This keeps
 *     "highlights reflect what the index matched" honest even when the only
 *     difference between the trace text and the query is whitespace.
 *   - **Token phrases** match the indexer's `hasSubstr(tokens(lower(search_text)),
 *     phraseTokens)`: lowercase, split on non-alphanumeric, ordered-adjacent
 *     subsequence.
 *   - Highlights are returned in document order (messageIndex, partIndex,
 *     startOffset, endOffset). `firstMatchIndex` is `0` when there's at least
 *     one hit, `-1` otherwise.
 *   - **Overlapping ranges are NOT deduplicated.** A query like
 *     `` "refund" `refund process` `` emits both the literal `[0, 6]` and the
 *     token `[0, 14]` ranges for the same source text. Each highlight carries
 *     its own `source` (literal/token/region), so the renderer (PR 3+) can
 *     decide stacking order and which click target wins. Dedup at this layer
 *     would erase information the popover needs.
 *   - Semantic-region highlights are NOT emitted here; PR 2 adds them
 *     server-side using winning-chunk metadata from `trace_search_embeddings`.
 */
export function computeTraceSearchHighlights(args: {
  readonly messages: readonly GenAIMessage[]
  readonly parsedQuery: ParsedSearchQuery
}): TraceSearchHighlightsResult {
  const { messages, parsedQuery } = args
  const { literalPhrases, tokenPhrases } = parsedQuery

  if (literalPhrases.length === 0 && tokenPhrases.length === 0) {
    return EMPTY_RESULT
  }

  const normalizedLiterals = literalPhrases.map((phrase) => ({ phrase, normalized: normalizeLiteralPhrase(phrase) }))
  const tokenizedPhrases = tokenPhrases.map((phrase) => ({ phrase, tokens: tokenizePhrase(phrase) }))

  const matchesNothing =
    normalizedLiterals.some(({ normalized }) => normalized.length === 0) ||
    tokenizedPhrases.some(({ tokens }) => tokens.length === 0)
  if (matchesNothing) return EMPTY_RESULT

  const highlights: TraceHighlight[] = []

  messages.forEach((message, messageIndex) => {
    if (!message || message.role === "system") return
    if (!message.parts) return

    message.parts.forEach((part, partIndex) => {
      if (part.type !== "text") return
      const content = typeof part.content === "string" ? part.content : ""
      if (content.length === 0) return

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
