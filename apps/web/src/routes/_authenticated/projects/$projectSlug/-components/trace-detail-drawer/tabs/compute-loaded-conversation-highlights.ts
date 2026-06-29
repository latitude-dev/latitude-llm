import {
  computeTraceSearchHighlights,
  type ParsedSearchQuery,
  parseSearchQuery,
  type TraceSearchHighlightsResult,
} from "@domain/spans"
import type { GenAIMessage } from "rosetta-ai"

function parseLoadedConversationSearchQuery(raw: string): ParsedSearchQuery {
  const parsed = parseSearchQuery(raw)
  if (parsed.literalPhrases.length === 0 && parsed.tokenPhrases.length === 0 && parsed.semanticPrompt.length > 0) {
    return {
      literalPhrases: [parsed.semanticPrompt],
      tokenPhrases: [],
      semanticPrompt: "",
    }
  }
  return parsed
}

export function formatConversationSearchForBackend(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return ""
  const parsed = parseLoadedConversationSearchQuery(trimmed)
  if (parsed.literalPhrases.length === 1 && parsed.tokenPhrases.length === 0 && parsed.semanticPrompt.length === 0) {
    const phrase = parsed.literalPhrases[0]
    if (phrase !== undefined && !trimmed.includes('"') && !trimmed.includes("`")) {
      return `"${phrase}"`
    }
  }
  return trimmed
}

export function computeLoadedConversationHighlights(
  messages: readonly GenAIMessage[],
  query: string,
): TraceSearchHighlightsResult {
  const trimmed = query.trim()
  if (trimmed.length === 0) return { highlights: [], firstMatchIndex: -1 }
  return computeTraceSearchHighlights({
    messages,
    parsedQuery: parseLoadedConversationSearchQuery(trimmed),
  })
}
