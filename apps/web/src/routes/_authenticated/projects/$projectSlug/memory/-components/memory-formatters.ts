const TARGET_TREND_BUCKETS = 30
const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * HOUR_SECONDS

/** 0..1 fraction → "12%", keeping sub-1% values visible as "<1%". */
export function formatPercent(rate: number): string {
  if (rate <= 0) return "0%"
  const percent = rate * 100
  if (percent < 1) return "<1%"
  if (percent < 10) return `${percent.toFixed(1).replace(/\.0$/, "")}%`
  return `${Math.round(percent)}%`
}

function compactCount(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

/** Signed token delta for the net-growth column, e.g. "+1.2k" / "−340" / "0". */
export function formatSignedCount(value: number): string {
  if (value === 0) return "0"
  return `${value > 0 ? "+" : "−"}${compactCount(Math.abs(value))}`
}

/**
 * Reads-per-write leverage. "∞" when a store is read but never written in the
 * window (pure retrieval), "-" when it is neither read nor written.
 */
export function formatRatio(reads: number, writes: number): string {
  if (writes === 0) return reads > 0 ? "∞" : "-"
  const ratio = reads / writes
  return `${ratio < 10 ? ratio.toFixed(1).replace(/\.0$/, "") : Math.round(ratio)}×`
}

// Day buckets round to the NEAREST day so the default 30-day window gets daily
// buckets rather than rounding up to 2-day ones.
export function pickMemoryTrendBucketSeconds(rangeMs: number): number {
  const rawSeconds = Math.max(1, Math.floor(rangeMs / 1000 / TARGET_TREND_BUCKETS))
  if (rawSeconds <= HOUR_SECONDS) return HOUR_SECONDS
  if (rawSeconds <= DAY_SECONDS) return Math.ceil(rawSeconds / HOUR_SECONDS) * HOUR_SECONDS
  return Math.max(1, Math.round(rawSeconds / DAY_SECONDS)) * DAY_SECONDS
}

export function formatBucketLabel(bucketStartIso: string, bucketSeconds: number): string {
  const date = new Date(bucketStartIso)
  if (Number.isNaN(date.getTime())) return bucketStartIso
  if (bucketSeconds < DAY_SECONDS) {
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
