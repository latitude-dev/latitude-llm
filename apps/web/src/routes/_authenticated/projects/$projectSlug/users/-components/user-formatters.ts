const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS
const HOUR_SECONDS = 60 * 60
const DAY_SECONDS = 24 * HOUR_SECONDS

/** Same bar as the tools dashboard: error rates at or above this render red. */
export const USER_FAILING_ERROR_RATE = 0.05

const TARGET_TREND_BUCKETS = 30

/** 0..1 fraction → "12%", keeping sub-1% values visible as "<1%". */
export function formatPercent(rate: number): string {
  if (rate <= 0) return "0%"
  const percent = rate * 100
  if (percent < 1) return "<1%"
  if (percent < 10) return `${percent.toFixed(1).replace(/\.0$/, "")}%`
  return `${Math.round(percent)}%`
}

// Day buckets round to the NEAREST day so the default 30-day window gets
// daily buckets rather than rounding up to 2-day ones (same as tools).
export function pickUserTrendBucketSeconds(rangeMs: number): number {
  const rawSeconds = Math.max(1, Math.floor(rangeMs / 1000 / TARGET_TREND_BUCKETS))
  if (rawSeconds <= HOUR_SECONDS) return HOUR_SECONDS
  if (rawSeconds <= DAY_SECONDS) return Math.ceil(rawSeconds / HOUR_SECONDS) * HOUR_SECONDS
  return Math.max(1, Math.round(rawSeconds / DAY_SECONDS)) * DAY_SECONDS
}

function formatCompactElapsed(elapsedMs: number): string {
  if (elapsedMs < HOUR_MS) {
    return `${Math.max(1, Math.floor(elapsedMs / MINUTE_MS))}m`
  }
  if (elapsedMs < DAY_MS) {
    return `${Math.max(1, Math.floor(elapsedMs / HOUR_MS))}h`
  }
  if (elapsedMs < MONTH_MS) {
    return `${Math.max(1, Math.floor(elapsedMs / DAY_MS))}d`
  }
  if (elapsedMs < YEAR_MS) {
    return `${Math.max(1, Math.floor(elapsedMs / MONTH_MS))}mo`
  }
  return `${Math.max(1, Math.floor(elapsedMs / YEAR_MS))}y`
}

export function formatAgoLabel(iso: string): string {
  return `${formatCompactElapsed(Math.max(0, Date.now() - new Date(iso).getTime()))} ago`
}

export function formatAgeLabel(iso: string): string {
  return `${formatCompactElapsed(Math.max(0, Date.now() - new Date(iso).getTime()))} old`
}

export function formatBucketLabel(bucket: string, bucketSeconds: number): string {
  const date = new Date(bucket)
  if (Number.isNaN(date.getTime())) return bucket
  if (bucketSeconds >= DAY_SECONDS) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function formatBucketTooltipLabel(bucket: string, bucketSeconds: number): string {
  const date = new Date(bucket)
  if (Number.isNaN(date.getTime())) return bucket
  if (bucketSeconds >= DAY_SECONDS) {
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric" })
  }
  return date.toLocaleString(undefined, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** Display identity for an end-user: prefer email, fall back to the raw id. */
export function userDisplayName(user: { readonly userId: string; readonly userEmail: string }): string {
  return user.userEmail || user.userId
}
