import type { TokenAnalyticsAggregate } from "@domain/spans"
import { cacheHitRate } from "@repo/utils"

/** The four token sums every metrics aggregate selects to derive token analytics. */
export const TOKEN_ANALYTICS_SUM_SELECT = `
  sum(tokens_input)        AS tokens_input_sum,
  sum(tokens_output)       AS tokens_output_sum,
  sum(tokens_cache_read)   AS tokens_cache_read_sum,
  sum(tokens_cache_create) AS tokens_cache_create_sum
`

interface TokenAnalyticsSumRow {
  readonly tokens_input_sum: string
  readonly tokens_output_sum: string
  readonly tokens_cache_read_sum: string
  readonly tokens_cache_create_sum: string
}

/**
 * Token-weighted analytics over the aggregated sums: the cache hit rate is
 * `ΣcacheRead / (Σinput + ΣcacheRead + ΣcacheCreate)` for the filtered set,
 * not an average of per-row rates.
 */
export function toTokenAnalytics(row: TokenAnalyticsSumRow): TokenAnalyticsAggregate {
  const inputTokens = Number(row.tokens_input_sum)
  const outputTokens = Number(row.tokens_output_sum)
  const cacheReadTokens = Number(row.tokens_cache_read_sum)
  const cacheCreateTokens = Number(row.tokens_cache_create_sum)
  return {
    cacheHitRate: cacheHitRate({ input: inputTokens, cacheRead: cacheReadTokens, cacheCreate: cacheCreateTokens }),
    inputTokens,
    cacheReadTokens,
    cacheCreateTokens,
    outputTokens,
  }
}
