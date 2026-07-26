/**
 * Replace any unpaired UTF-16 surrogate with U+FFFD (`�`). ClickHouse rejects
 * lone surrogates when applying `LIKE`, so the lexical indexer canonicalises
 * them on the way in; the highlight endpoint uses the same canonicalisation
 * so matched substring offsets line up with what the index actually saw.
 */
export function stripLoneSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�")
}

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

/** Recursively strips lone surrogates from every string (object keys included) in a JSON-shaped value. */
export function deepStripLoneSurrogates<T>(value: T): T {
  if (typeof value === "string") return stripLoneSurrogates(value) as T
  if (Array.isArray(value)) return value.map(deepStripLoneSurrogates) as T
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[stripLoneSurrogates(key)] = deepStripLoneSurrogates(val)
    }
    return result as T
  }
  return value
}
