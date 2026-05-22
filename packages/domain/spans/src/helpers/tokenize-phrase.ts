/**
 * Tokenize a backtick phrase the same way the `search_text` text index does:
 * lower-case first, then split on every non-alphanumeric ASCII byte (matching
 * ClickHouse's `splitByNonAlpha`). Empty fragments are dropped.
 *
 * Single source of truth for token-phrase tokenization. The lexical search
 * indexer uses this to build the `hasAllTokens` / `hasSubstr` predicates; the
 * trace-search-highlights endpoint uses the same function so highlighted
 * matches stay faithful to what the index matched.
 */
export function tokenizePhrase(phrase: string): readonly string[] {
  return phrase
    .toLowerCase()
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t.length > 0)
}
