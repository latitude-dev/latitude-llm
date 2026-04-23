const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS
const lifecycleDisplayOrder = ["regressed", "escalating", "new", "resolved", "ignored"] as const
const lifecycleDisplayOrderSet = new Set<string>(lifecycleDisplayOrder)

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

export function formatDayBucketLabel(bucket: string): string {
  return new Date(`${bucket}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function formatDayBucketTooltipLabel(bucket: string): string {
  return new Date(`${bucket}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  })
}

export function getLifecycleStatesForDisplay(states: readonly string[]): readonly string[] {
  const stateSet = new Set(states)

  return [
    ...lifecycleDisplayOrder.filter((state) => stateSet.has(state)),
    ...states.filter((state) => !lifecycleDisplayOrderSet.has(state)),
  ]
}

export function formatLifecycleLabel(state: string): string {
  switch (state) {
    case "new":
      return "New"
    case "escalating":
      return "Escalating"
    case "resolved":
      return "Resolved"
    case "regressed":
      return "Regressed"
    case "ignored":
      return "Ignored"
    default:
      return state
  }
}
