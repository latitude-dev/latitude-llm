import { computeTraceSearchHighlights, parseSearchQuery, type TraceSearchHighlightsResult } from "@domain/spans"
import type { GenAIMessage } from "rosetta-ai"

export function computeLoadedConversationHighlights(
  messages: readonly GenAIMessage[],
  query: string,
): TraceSearchHighlightsResult {
  const trimmed = query.trim()
  if (trimmed.length === 0) return { highlights: [], firstMatchIndex: -1 }
  return computeTraceSearchHighlights({
    messages,
    parsedQuery: parseSearchQuery(trimmed),
  })
}
