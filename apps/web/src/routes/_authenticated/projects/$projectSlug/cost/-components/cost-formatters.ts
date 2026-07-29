import { COST_SERIES_METRICS, type CostSeriesMetric } from "@domain/spans"
import type { CostSeriesBucketRecord } from "../../../../../../domains/cost/cost.functions.ts"

export const isCostSeriesMetric = (value: string): value is CostSeriesMetric =>
  COST_SERIES_METRICS.some((metric) => metric === value)

const MICROCENTS_PER_USD = 100_000_000
const HOUR_SECONDS = 60 * 60
export const DAY_SECONDS = 24 * HOUR_SECONDS

export const microcentsToUsd = (microcents: number): number => microcents / MICROCENTS_PER_USD

/**
 * Bucket width for the spend chart. Cost is read per day (providers bill in UTC
 * days), so day buckets are the default and hourly only kicks in for windows too
 * short to hold a day.
 */
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

/**
 * Fills the gaps a grouped query leaves out. Empty buckets must render as $0
 * rather than closing the gap, or a quiet day reads as a shorter window.
 */
export function densifyCostBuckets({
  buckets,
  fromIso,
  toIso,
  bucketSeconds,
}: {
  readonly buckets: readonly CostSeriesBucketRecord[]
  readonly fromIso: string
  readonly toIso: string
  readonly bucketSeconds: number
}): readonly CostSeriesBucketRecord[] {
  const fromMs = Date.parse(fromIso)
  const toMs = Date.parse(toIso)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return buckets

  const byStart = new Map(buckets.map((bucket) => [Date.parse(bucket.bucketStartIso), bucket]))
  const stepMs = bucketSeconds * 1000
  const dense: CostSeriesBucketRecord[] = []
  for (let ms = alignBucketStartMs(fromMs, bucketSeconds); ms < toMs; ms += stepMs) {
    dense.push(byStart.get(ms) ?? { bucketStartIso: new Date(ms).toISOString(), valueMicrocents: 0, byModel: [] })
  }
  return dense
}

/**
 * Index of the bucket still filling up — the one whose span runs past the end of
 * the window (or past now). Without flagging it, the last bar always reads as
 * "spend is falling".
 */
export function resolveIncompleteBucketIndex({
  buckets,
  bucketSeconds,
  toIso,
  nowMs,
}: {
  readonly buckets: readonly CostSeriesBucketRecord[]
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
 * Spend per day over the buckets that have fully elapsed. Dividing the window's
 * total by its nominal length instead makes the figure crater every morning and
 * climb all day on unchanged usage, because the newest bucket is always partial.
 * Null until a full day has elapsed inside the window — there is nothing to
 * average yet, and extrapolating from a few hours would be a projection.
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
  const edgeMs = Math.min(toMs, nowMs)
  const stepMs = bucketSeconds * 1000

  let completeCount = 0
  let completeMicrocents = 0
  for (const bucket of buckets) {
    const startMs = Date.parse(bucket.bucketStartIso)
    if (!Number.isFinite(startMs) || startMs < fromMs || startMs + stepMs > edgeMs) continue
    completeCount += 1
    completeMicrocents += bucket.valueMicrocents
  }

  const completeSeconds = completeCount * bucketSeconds
  if (completeSeconds < DAY_SECONDS) return null
  return completeMicrocents / (completeSeconds / DAY_SECONDS)
}

/**
 * Bucket labels in UTC. `toLocaleDateString` without a timezone would shift a
 * `00:00Z` day bucket onto the previous day for western viewers — a chart of UTC
 * buckets with local labels is the silently-wrong combination.
 */
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

/** Per-bucket unit for the y-axis and tooltips ("$/day" and friends). */
export function bucketUnitLabel(bucketSeconds: number): string {
  if (bucketSeconds < DAY_SECONDS) return "hour"
  if (bucketSeconds === DAY_SECONDS) return "day"
  return `${Math.round(bucketSeconds / DAY_SECONDS)}d`
}
