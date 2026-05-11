/**
 * Parsed shape of a raw trace-search query.
 *
 * Quoted segments (`"..."`) become explicit phrase filters. Everything else
 * collapses into a single semantic prompt. The split lets the repository emit
 * a token-index filter for the phrases and a separate cosine-similarity ranker
 * for the prompt — no heuristic intent detection.
 */
export interface ParsedSearchQuery {
  readonly phrases: readonly string[]
  readonly semanticPrompt: string
}

/**
 * Parse a raw search-bar input into phrase filters and a residual semantic
 * prompt.
 *
 * Rules:
 *   - Each balanced `"..."` segment becomes one phrase. Empty phrases (`""`)
 *     are dropped.
 *   - Whitespace separates phrases from each other and from free text.
 *   - An unmatched leading or trailing quote is treated as a literal: the
 *     quote character and the unparsed remainder fall into `semanticPrompt`.
 *     No syntax errors surface to the caller — the search bar should never
 *     reject input.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const trimmed = raw.trim()
  if (trimmed === "") return { phrases: [], semanticPrompt: "" }

  const phrases: string[] = []
  const promptParts: string[] = []
  let i = 0

  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === '"') {
      const close = trimmed.indexOf('"', i + 1)
      if (close === -1) {
        // Unmatched quote — treat the rest as literal semantic text.
        promptParts.push(trimmed.slice(i))
        break
      }
      const phrase = trimmed.slice(i + 1, close)
      if (phrase.length > 0) phrases.push(phrase)
      i = close + 1
      continue
    }
    // Accumulate a free-text run up to the next quote.
    const nextQuote = trimmed.indexOf('"', i)
    const end = nextQuote === -1 ? trimmed.length : nextQuote
    const segment = trimmed.slice(i, end)
    if (segment.trim().length > 0) promptParts.push(segment)
    i = end
  }

  const semanticPrompt = promptParts.join(" ").replace(/\s+/g, " ").trim()
  return { phrases, semanticPrompt }
}
