import { stripLoneSurrogates } from "@repo/utils"

// Re-exported for existing consumers: ClickHouse rejects lone surrogates when
// applying `LIKE`, so the lexical indexer canonicalises them on the way in;
// the highlight endpoint uses the same canonicalisation so matched substring
// offsets line up with what the index actually saw.
export { stripLoneSurrogates }

/**
 * Canonical normaliser for double-quoted literal phrases. Trim, collapse runs
 * of whitespace into single spaces, and replace lone surrogates. Single source
 * of truth shared by the lexical search plan (turns the normalised phrase into
 * a `LIKE` pattern) and the trace-search-highlights endpoint (matches it back
 * against the raw rendered text).
 *
 * Phrases that collapse to the empty string are not "ignored" — both callers
 * interpret an empty normalised phrase as a *match-nothing* signal for the
 * whole query.
 */
export function normalizeLiteralPhrase(text: string): string {
  return stripLoneSurrogates(text.trim().replace(/\s+/g, " "))
}
