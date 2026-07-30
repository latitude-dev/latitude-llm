import {
  COST_BREAKDOWN_DIMENSIONS,
  COST_SERIES_METRICS,
  type CostBreakdownDimension,
  type CostSeriesMetric,
} from "@domain/spans"
import { formatPrice } from "@repo/utils"
import type { CostSeriesBucketRecord, ModelUsageBucketRecord } from "../../../../../../domains/cost/cost.functions.ts"

export const isCostSeriesMetric = (value: string): value is CostSeriesMetric =>
  COST_SERIES_METRICS.some((metric) => metric === value)

export const isCostBreakdownDimension = (value: string): value is CostBreakdownDimension =>
  COST_BREAKDOWN_DIMENSIONS.some((dimension) => dimension === value)

/** Which measure the model-usage chart plots; both arrive in one payload, so this is client-only. */
const MODEL_USAGE_MEASURES = ["cost", "tokens"] as const
export type ModelUsageMeasure = (typeof MODEL_USAGE_MEASURES)[number]

export const isModelUsageMeasure = (value: string): value is ModelUsageMeasure =>
  MODEL_USAGE_MEASURES.some((measure) => measure === value)

const MICROCENTS_PER_USD = 100_000_000
const HOUR_SECONDS = 60 * 60
export const DAY_SECONDS = 24 * HOUR_SECONDS

export const microcentsToUsd = (microcents: number): number => microcents / MICROCENTS_PER_USD

/** Day buckets by default, matching how providers bill; hours only below two days. */
export function pickCostBucketSeconds(rangeMs: number): number {
  const rangeSeconds = Math.max(1, Math.round(rangeMs / 1000))
  if (rangeSeconds <= 2 * DAY_SECONDS) return HOUR_SECONDS
  if (rangeSeconds <= 90 * DAY_SECONDS) return DAY_SECONDS
  return 7 * DAY_SECONDS
}

/** Bucket starts are epoch-aligned by ClickHouse, so day buckets begin at UTC midnight. */
const alignBucketStartMs = (ms: number, bucketSeconds: number): number => {
  const stepMs = bucketSeconds * 1000
  return Math.floor(ms / stepMs) * stepMs
}

/** Fills the empty buckets a grouped query omits, so a quiet day renders as $0 rather than closing the gap. */
function densifyBuckets<T extends { readonly bucketStartIso: string }>({
  buckets,
  fromIso,
  toIso,
  bucketSeconds,
  emptyBucket,
}: {
  readonly buckets: readonly T[]
  readonly fromIso: string
  readonly toIso: string
  readonly bucketSeconds: number
  readonly emptyBucket: (bucketStartIso: string) => T
}): readonly T[] {
  const fromMs = Date.parse(fromIso)
  const toMs = Date.parse(toIso)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return buckets

  const byStart = new Map(buckets.map((bucket) => [Date.parse(bucket.bucketStartIso), bucket]))
  const stepMs = bucketSeconds * 1000
  const dense: T[] = []
  for (let ms = alignBucketStartMs(fromMs, bucketSeconds); ms < toMs; ms += stepMs) {
    dense.push(byStart.get(ms) ?? emptyBucket(new Date(ms).toISOString()))
  }
  return dense
}

export const densifyCostBuckets = (input: {
  readonly buckets: readonly CostSeriesBucketRecord[]
  readonly fromIso: string
  readonly toIso: string
  readonly bucketSeconds: number
}): readonly CostSeriesBucketRecord[] =>
  densifyBuckets({
    ...input,
    emptyBucket: (bucketStartIso) => ({ bucketStartIso, valueMicrocents: 0, byModel: [] }),
  })

export const densifyModelUsageBuckets = (input: {
  readonly buckets: readonly ModelUsageBucketRecord[]
  readonly fromIso: string
  readonly toIso: string
  readonly bucketSeconds: number
}): readonly ModelUsageBucketRecord[] =>
  densifyBuckets({
    ...input,
    emptyBucket: (bucketStartIso) => ({ bucketStartIso, byModel: [], other: { costMicrocents: 0, tokens: 0 } }),
  })

/** The bucket whose span runs past the window's end or past now, so it is still filling. */
export function resolveIncompleteBucketIndex({
  buckets,
  bucketSeconds,
  toIso,
  nowMs,
}: {
  readonly buckets: readonly { readonly bucketStartIso: string }[]
  readonly bucketSeconds: number
  readonly toIso: string
  readonly nowMs: number
}): number | undefined {
  if (buckets.length === 0) return undefined
  const toMs = Date.parse(toIso)
  const edgeMs = Math.min(Number.isFinite(toMs) ? toMs : nowMs, nowMs)
  const lastIndex = buckets.length - 1
  const lastStartMs = Date.parse(buckets[lastIndex]?.bucketStartIso ?? "")
  if (!Number.isFinite(lastStartMs)) return undefined
  return lastStartMs + bucketSeconds * 1000 > edgeMs ? lastIndex : undefined
}

/**
 * Spend per day over the buckets that have fully elapsed. Null until a full day
 * has elapsed in the window, rather than extrapolating from a partial one.
 */
export function computeDailyAverageMicrocents({
  buckets,
  bucketSeconds,
  fromIso,
  toIso,
  nowMs,
}: {
  readonly buckets: readonly CostSeriesBucketRecord[]
  readonly bucketSeconds: number
  readonly fromIso: string
  readonly toIso: string
  readonly nowMs: number
}): number | null {
  const fromMs = Date.parse(fromIso)
  const toMs = Date.parse(toIso)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null
  const stepMs = bucketSeconds * 1000
  const edgeMs = Math.min(toMs, nowMs)

  // From the window, never the rows: a grouped query omits buckets with no spend.
  const firstCompleteMs = Math.ceil(fromMs / stepMs) * stepMs
  const lastCompleteEndMs = Math.floor(edgeMs / stepMs) * stepMs
  const completeSeconds = Math.max(0, (lastCompleteEndMs - firstCompleteMs) / 1000)
  if (completeSeconds < DAY_SECONDS) return null

  let completeMicrocents = 0
  for (const bucket of buckets) {
    const startMs = Date.parse(bucket.bucketStartIso)
    if (!Number.isFinite(startMs) || startMs < firstCompleteMs || startMs >= lastCompleteEndMs) continue
    completeMicrocents += bucket.valueMicrocents
  }

  return completeMicrocents / (completeSeconds / DAY_SECONDS)
}

/** UTC labels: without the timezone, a `00:00Z` day bucket shifts onto the previous day for western viewers. */
export function formatUtcBucketLabel(bucketStartIso: string, bucketSeconds: number): string {
  const date = new Date(bucketStartIso)
  if (Number.isNaN(date.getTime())) return bucketStartIso
  if (bucketSeconds < DAY_SECONDS) {
    return date.toLocaleString(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return date.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" })
}

export function formatUtcBucketRange(bucketStartIso: string, bucketSeconds: number): string {
  const startMs = Date.parse(bucketStartIso)
  if (!Number.isFinite(startMs)) return bucketStartIso
  if (bucketSeconds < DAY_SECONDS) {
    const end = new Date(startMs + bucketSeconds * 1000)
    return `${formatUtcBucketLabel(bucketStartIso, bucketSeconds)} – ${end.toLocaleTimeString(undefined, {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    })} UTC`
  }
  return `${formatUtcBucketLabel(bucketStartIso, bucketSeconds)} · UTC day`
}

/** Null rather than 0 when there is no denominator, so a share renders as "—" instead of "0%". */
export const shareOf = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null)

/** `formatPrice` assumes a non-negative amount, and a non-additive provider total can leave a negative remainder. */
export const formatSignedPrice = (amountUsd: number): string =>
  amountUsd < 0 ? `-${formatPrice(-amountUsd)}` : formatPrice(amountUsd)

/**
 * A row's cost per call against the window's average, the figure that says a
 * dimension eats a share of the money out of proportion to how much it is used.
 * Null when there is no baseline: nothing called here, or nothing spent at all.
 */
export function costPerCallMultiple({
  totalMicrocents,
  calls,
  avgPerCallMicrocents,
}: {
  readonly totalMicrocents: number
  readonly calls: number
  readonly avgPerCallMicrocents: number
}): number | null {
  if (calls <= 0 || avgPerCallMicrocents <= 0) return null
  return totalMicrocents / calls / avgPerCallMicrocents
}

export function formatCostMultiple(multiple: number): string {
  if (multiple >= 10) return `${Math.round(multiple)}×`
  if (multiple > 0 && multiple < 0.05) return "<0.1×"
  return `${multiple.toFixed(1)}×`
}

/** Per-bucket unit for the y-axis and tooltips ("$/day" and friends). */
export function bucketUnitLabel(bucketSeconds: number): string {
  if (bucketSeconds < DAY_SECONDS) return "hour"
  if (bucketSeconds === DAY_SECONDS) return "day"
  return `${Math.round(bucketSeconds / DAY_SECONDS)}d`
}
