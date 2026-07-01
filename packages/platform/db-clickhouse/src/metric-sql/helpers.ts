import type { MonitorMetric } from "@domain/shared"

/** ClickHouse `DateTime64` params take a space-separated, zone-naive string (UTC). */
const toClickHouseDateTime64 = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")

/** Standard windowing clauses shared by every inner subquery (`[from, to)` on the time axis). */
export const windowParams = (input: { organizationId: string; projectId: string; from: Date; to: Date }) => ({
  organizationId: input.organizationId,
  projectId: input.projectId,
  windowFrom: toClickHouseDateTime64(input.from),
  windowTo: toClickHouseDateTime64(input.to),
})

// ---------------------------------------------------------------------------
// Trace family (traces / sessions / spans): one metric vocabulary
//
// All three expose duration / cost / tokens / prompt-cache columns and an error
// predicate, so they share one aggregate builder parameterised by the few
// expressions that differ (the count/dedup, the error predicate, and — for
// spans — usage-gated token/cost columns). A stream WITHOUT this shape does NOT
// widen these columns: it gets its own descriptor + aggregate under `streams/`.
// ---------------------------------------------------------------------------

export interface TraceFamilyColumns {
  /** Count/dedup expression — `count()` for row-grained streams, a dedup for traces. */
  readonly count: string
  readonly isError: string
  readonly duration: string
  readonly cost: string
  readonly tokens: string
  readonly inputTokens: string
  readonly cacheRead: string
  readonly cacheCreate: string
}

/**
 * Metric → SQL aggregate over the trace-family columns. Ratios/averages guard the
 * empty group (`count() = 0`) so a metric over an empty window/bucket reads `0`,
 * not `nan` — densified empty buckets then stay numeric.
 */
export const traceFamilyAggregate = (metric: MonitorMetric, c: TraceFamilyColumns): string => {
  switch (metric.kind) {
    case "count":
      return c.count
    case "errorRate":
      return `if(count() = 0, 0, countIf(${c.isError}) / count())`
    case "cacheHitRate": {
      // Token-weighted prompt-cache ratio. Guard divide-by-zero: a window with no
      // input-side tokens has an undefined rate, so read 0 (not nan) like errorRate.
      const denominator = `(sum(${c.inputTokens}) + sum(${c.cacheRead}) + sum(${c.cacheCreate}))`
      return `if(${denominator} = 0, 0, sum(${c.cacheRead}) / ${denominator})`
    }
    case "sum":
      return `sum(${c[metric.field]})`
    case "min":
      return `if(count() = 0, 0, min(${c[metric.field]}))`
    case "max":
      return `if(count() = 0, 0, max(${c[metric.field]}))`
    case "avg":
      return `if(count() = 0, 0, avg(${c[metric.field]}))`
    case "median":
      return `if(count() = 0, 0, quantileTDigest(0.5)(${c[metric.field]}))`
  }
}

// Operations whose token/cost usage should sum. Mirrors the rollup usage allowlist
// (traces_mv / sessions_mv) so wrapper spans don't double-count cost/tokens.
const USAGE_OPERATIONS_SQL = "('chat', 'text_completion', 'generate_content', 'embeddings', 'reranker')"

/** Gate a span column to billable operations (NULL otherwise) so sum/avg ignore wrapper + tool spans. */
export const usageGated = (column: string): string => `if(operation IN ${USAGE_OPERATIONS_SQL}, ${column}, NULL)`
