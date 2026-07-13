import type { FilterCondition, FilterSet } from "@domain/shared"

import { emptyTraceTimeHistogramBucket, type TraceTimeHistogramBucket } from "./ports/trace-repository.ts"

const DEFAULT_RANGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Hard cap on the histogram's time span. The list and aggregations honor an unbounded
 * ("All time") selection, but the histogram is a per-bucket scan whose cost grows with
 * the span, so it never charts more than this window — anchored to the selection's end.
 */
const MAX_HISTOGRAM_SPAN_MS = 30 * 24 * 60 * 60 * 1000

/** Rough target bar count; actual count depends on the chosen nice bucket width. */
const TARGET_HISTOGRAM_BUCKET_COUNT = 50

/** Must stay in sync with `getTraceTimeHistogramByProject` input validation (`bucketSeconds.max`). */
const MAX_HISTOGRAM_BUCKET_SECONDS = 90 * 24 * 60 * 60

/**
 * Ascending "nice" bucket widths (seconds). Pick the smallest entry ≥ ideal width from the target bar count.
 */
const NICE_HISTOGRAM_BUCKET_SECONDS_ASC: readonly number[] = [
  1,
  2,
  5,
  10,
  15,
  30,
  60, // 1 minute
  2 * 60,
  5 * 60,
  10 * 60,
  15 * 60,
  30 * 60,
  60 * 60, // 1 hour
  2 * 60 * 60,
  3 * 60 * 60,
  4 * 60 * 60,
  5 * 60 * 60, // 5 hours
  6 * 60 * 60,
  7 * 60 * 60,
  8 * 60 * 60,
  12 * 60 * 60,
  24 * 60 * 60, // 1 day
  2 * 24 * 60 * 60,
  3 * 24 * 60 * 60,
  4 * 24 * 60 * 60,
  5 * 24 * 60 * 60,
  7 * 24 * 60 * 60, // 1 week
  14 * 24 * 60 * 60,
  30 * 24 * 60 * 60, // 30 days
  60 * 24 * 60 * 60, // 60 days
  MAX_HISTOGRAM_BUCKET_SECONDS, // 90 days
]

export function parseStartTimeBoundsFromFilters(filters: FilterSet): { gte?: string; lte?: string } {
  const conds = filters.startTime
  if (!conds) return {}
  const out: { gte?: string; lte?: string } = {}
  for (const c of conds) {
    if (c.op === "gte") out.gte = String(c.value)
    if (c.op === "lte") out.lte = String(c.value)
  }
  return out
}

/**
 * Resolves the histogram time window (ISO strings, UTC), anchored to the selection's end.
 * When no `startTime` `gte` is set (unbounded / "All time"), starts {@link DEFAULT_RANGE_MS}
 * before the end. The span is always clamped to {@link MAX_HISTOGRAM_SPAN_MS} so an unbounded
 * or very wide list selection never turns into an unbounded per-bucket scan.
 */
export function resolveTraceHistogramRangeIso(
  filters: FilterSet,
  nowMs: number,
): { readonly rangeStartIso: string; readonly rangeEndIso: string } {
  const { gte, lte } = parseStartTimeBoundsFromFilters(filters)
  // Bounds come from the URL and may be unparseable (hand-crafted); fall back to the defaults so
  // `new Date(NaN).toISOString()` can never throw. Clamp start ≤ end for a safe (degenerate) window.
  const parsedEndMs = lte ? new Date(lte).getTime() : nowMs
  const endMs = Number.isFinite(parsedEndMs) ? parsedEndMs : nowMs
  const parsedStartMs = gte ? new Date(gte).getTime() : endMs - DEFAULT_RANGE_MS
  const desiredStartMs = Number.isFinite(parsedStartMs) ? parsedStartMs : endMs - DEFAULT_RANGE_MS
  const startMs = Math.min(Math.max(desiredStartMs, endMs - MAX_HISTOGRAM_SPAN_MS), endMs)

  return {
    rangeStartIso: new Date(startMs).toISOString(),
    rangeEndIso: new Date(endMs).toISOString(),
  }
}

/**
 * Picks a human-friendly histogram bucket width: divide range by {@link TARGET_HISTOGRAM_BUCKET_COUNT},
 * then use the smallest "nice" duration (1s … 90d) that is **not smaller** than that ideal.
 */
export function pickTraceHistogramBucketSeconds(rangeStartMs: number, rangeEndMs: number): number {
  const rangeMs = Math.max(0, rangeEndMs - rangeStartMs)
  if (rangeMs === 0) return 60

  const idealSec = rangeMs / (TARGET_HISTOGRAM_BUCKET_COUNT * 1000)
  for (const step of NICE_HISTOGRAM_BUCKET_SECONDS_ASC) {
    if (step >= idealSec) {
      return step
    }
  }
  return MAX_HISTOGRAM_BUCKET_SECONDS
}

/** Filters for trace queries: same as `filters` but `startTime` replaced by the histogram window. */
export function mergeTraceHistogramTimeFilters(
  filters: FilterSet | undefined,
  rangeStartIso: string,
  rangeEndIso: string,
): FilterSet {
  const next: Record<string, readonly FilterCondition[]> = {}
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (k !== "startTime") next[k] = v
    }
  }
  next.startTime = [
    { op: "gte", value: rangeStartIso },
    { op: "lte", value: rangeEndIso },
  ]
  return next
}

/**
 * Aligns a Unix timestamp (seconds) to a histogram bucket start, matching ClickHouse
 * `intDiv(toUnixTimestamp(ts), bucketSeconds) * bucketSeconds`.
 */
export function alignUnixSecondsToHistogramBucket(unixSeconds: number, bucketSeconds: number): number {
  const bs = Math.floor(bucketSeconds)
  if (bs < 1) return unixSeconds
  return Math.floor(unixSeconds / bs) * bs
}

/**
 * Expands sparse `GROUP BY` histogram rows into a full UTC-aligned series (missing buckets → 0).
 * Use the same `rangeStartIso`, `rangeEndIso`, and `bucketSeconds` as the histogram query.
 */
export function denseTraceTimeHistogramBuckets(
  sparse: readonly TraceTimeHistogramBucket[] | undefined,
  rangeStartIso: string,
  rangeEndIso: string,
  bucketSeconds: number,
): readonly TraceTimeHistogramBucket[] {
  const startMs = Date.parse(rangeStartIso)
  const endMs = Date.parse(rangeEndIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return []
  }

  const bs = Math.floor(bucketSeconds)
  if (bs < 1) return []

  const startSec = Math.floor(startMs / 1000)
  const endSec = Math.floor(endMs / 1000)
  const first = alignUnixSecondsToHistogramBucket(startSec, bs)
  const last = alignUnixSecondsToHistogramBucket(endSec, bs)

  // ClickHouse already groups by aligned `bucket_start`, so sparse rows are unique by key in
  // practice; key-aligning here is a defensive fold against malformed input. Additive fields
  // (count, sums) combine cleanly. Medians cannot be re-derived from two pre-computed medians,
  // so we take the max as a safe upper bound rather than producing a meaningless sum.
  const buckets = new Map<number, TraceTimeHistogramBucket>()
  for (const b of sparse ?? []) {
    const t = Date.parse(b.bucketStart)
    if (!Number.isFinite(t)) continue
    const key = alignUnixSecondsToHistogramBucket(Math.floor(t / 1000), bs)
    const prev = buckets.get(key) ?? emptyTraceTimeHistogramBucket(new Date(key * 1000).toISOString())
    buckets.set(key, {
      bucketStart: prev.bucketStart,
      traceCount: prev.traceCount + b.traceCount,
      sessionCount: prev.sessionCount + b.sessionCount,
      costTotalMicrocentsSum: prev.costTotalMicrocentsSum + b.costTotalMicrocentsSum,
      durationNsMedian: Math.max(prev.durationNsMedian, b.durationNsMedian),
      tokensTotalSum: prev.tokensTotalSum + b.tokensTotalSum,
      spanCountSum: prev.spanCountSum + b.spanCountSum,
      timeToFirstTokenNsMedian: Math.max(prev.timeToFirstTokenNsMedian, b.timeToFirstTokenNsMedian),
      tokensInputSum: prev.tokensInputSum + b.tokensInputSum,
      tokensCacheReadSum: prev.tokensCacheReadSum + b.tokensCacheReadSum,
      tokensCacheCreateSum: prev.tokensCacheCreateSum + b.tokensCacheCreateSum,
    })
  }

  const out: TraceTimeHistogramBucket[] = []
  for (let u = first; u <= last; u += bs) {
    const iso = new Date(u * 1000).toISOString()
    out.push(buckets.get(u) ?? emptyTraceTimeHistogramBucket(iso))
  }
  return out
}
