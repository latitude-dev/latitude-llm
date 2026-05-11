// Lifecycle helpers (`getLifecycleStatesForDisplay`, `getPrimaryLifecycleState`,
// `formatLifecycleLabel`) moved to a shared location so the in-app
// notifications UI can reuse them. Re-exported here so existing in-route
// imports keep working unchanged.
export {
  formatLifecycleLabel,
  getLifecycleStatesForDisplay,
  getPrimaryLifecycleState,
} from "../../../../../../components/issues/lifecycle-formatters.ts"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

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

export function formatSeenAgeParts(lastSeenAtIso: string, firstSeenAtIso: string) {
  const now = Date.now()
  const lastSeenAt = new Date(lastSeenAtIso).getTime()
  const firstSeenAt = new Date(firstSeenAtIso).getTime()

  return {
    lastSeenLabel: `${formatCompactElapsed(Math.max(0, now - lastSeenAt))} ago`,
    firstSeenLabel: `${formatCompactElapsed(Math.max(0, now - firstSeenAt))} old`,
  }
}

/** Same wording as the “last seen” half of {@link formatSeenAgeParts} (e.g. `3h ago`). */
export function formatIssueAgeAgoLabel(iso: string): string {
  const now = Date.now()
  const t = new Date(iso).getTime()
  return `${formatCompactElapsed(Math.max(0, now - t))} ago`
}

export function getAlignmentVariant(score: number): "destructive" | "warning" | "success" {
  if (score < 0.5) {
    return "destructive"
  }

  if (score < 0.75) {
    return "warning"
  }

  return "success"
}

export function formatPercent(value: number): string {
  const percent = Math.max(0, value) * 100

  if (percent === 0) {
    return "0%"
  }

  if (percent < 10) {
    return `${percent.toFixed(1).replace(/\.0$/, "")}%`
  }

  return `${Math.round(percent)}%`
}

const DAY_SECONDS = 24 * 60 * 60

/**
 * Bucket-size-aware label suitable for an x-axis tick. Daily buckets show just the date;
 * sub-day buckets include the start hour so the user can place sub-day incident overlays.
 *
 * Accepts either an ISO timestamp (`YYYY-MM-DDTHH:MM:SS.000Z`) or the legacy `YYYY-MM-DD`
 * shape — the latter is normalized to UTC midnight.
 */
export function formatHistogramBucketLabel(bucket: string, bucketSeconds: number): string {
  const date = parseHistogramBucket(bucket)
  if (Number.isNaN(date.getTime())) return bucket
  if (bucketSeconds >= DAY_SECONDS) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatHistogramBucketTooltipLabel(bucket: string, bucketSeconds: number): string {
  const date = parseHistogramBucket(bucket)
  if (Number.isNaN(date.getTime())) return bucket
  if (bucketSeconds >= DAY_SECONDS) {
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric" })
  }
  return date.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function parseHistogramBucket(bucket: string): Date {
  // Legacy `YYYY-MM-DD` strings are still emitted by the per-issue list mini-bar; everything
  // else is already ISO. Normalize the daily shape to UTC midnight.
  return new Date(bucket.length === 10 ? `${bucket}T00:00:00.000Z` : bucket)
}
