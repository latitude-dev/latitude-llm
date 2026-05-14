/**
 * Parsed shape of a raw trace-search query.
 *
 * Double-quoted segments (`"..."`) become literal substring filters.
 * Backtick segments (`` `...` ``) become ordered token-phrase filters.
 * Everything else collapses into a single semantic prompt. The split lets the
 * repository compose literal, lexical, and semantic search without heuristic
 * intent detection.
 */
export interface ParsedSearchQuery {
  readonly literalPhrases: readonly string[]
  readonly tokenPhrases: readonly string[]
  readonly semanticPrompt: string
}

/**
 * Parse a raw search-bar input into literal filters, token-phrase filters, and
 * a residual semantic prompt.
 *
 * Rules:
 *   - Each balanced `"..."` segment becomes one literal phrase. Empty phrases
 *     (`""`) are dropped.
 *   - Each balanced `` `...` `` segment becomes one ordered token phrase. Empty
 *     phrases are dropped.
 *   - Whitespace separates phrases from each other and from free text.
 *   - An unmatched leading or trailing delimiter is treated as a literal: the
 *     delimiter and the unparsed remainder fall into `semanticPrompt`. No
 *     syntax errors surface to the caller — the search bar should never reject
 *     input.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const trimmed = raw.trim()
  if (trimmed === "") return { literalPhrases: [], tokenPhrases: [], semanticPrompt: "" }

  const literalPhrases: string[] = []
  const tokenPhrases: string[] = []
  const promptParts: string[] = []
  let i = 0

  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === '"' || ch === "`") {
      const close = trimmed.indexOf(ch, i + 1)
      if (close === -1) {
        // Unmatched delimiter — treat the rest as literal semantic text.
        promptParts.push(trimmed.slice(i))
        break
      }
      const phrase = trimmed.slice(i + 1, close)
      if (phrase.length > 0) {
        if (ch === '"') literalPhrases.push(phrase)
        else tokenPhrases.push(phrase)
      }
      i = close + 1
      continue
    }
    // Accumulate a free-text run up to the next phrase delimiter.
    const nextQuote = trimmed.indexOf('"', i)
    const nextBacktick = trimmed.indexOf("`", i)
    const candidates = [nextQuote, nextBacktick].filter((idx) => idx !== -1)
    const end = candidates.length === 0 ? trimmed.length : Math.min(...candidates)
    const segment = trimmed.slice(i, end)
    if (segment.trim().length > 0) promptParts.push(segment)
    i = end
  }

  const semanticPrompt = promptParts.join(" ").replace(/\s+/g, " ").trim()
  return { literalPhrases, tokenPhrases, semanticPrompt }
}
