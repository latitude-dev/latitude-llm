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

/** Completed→consumed ratio as a percent, or "-" when nothing has completed yet. */
export function formatWriteYield(consumed: number, completed: number): string {
  if (completed <= 0) return "-"
  return formatPercent(consumed / completed)
}

/** Signed token delta for the net-growth column, e.g. "+1.2k" / "−340" / "0". */
export function formatSignedCount(value: number): string {
  if (value === 0) return "0"
  const sign = value > 0 ? "+" : "−"
  return `${sign}${compactCount(Math.abs(value))}`
}

function compactCount(value: number): string {
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

// Mirrors the tools bucket picker: day buckets round to the nearest day so the
// default 30-day window gets daily buckets rather than rounding up.
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
