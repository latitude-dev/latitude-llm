import type { ToolSummaryRecord } from "../../../../../../domains/tools/tools.functions.ts"

export const TOOL_FAILING_ERROR_RATE = 0.05
export const TOOL_CRITICAL_ERROR_RATE = 0.25

export const DEFAULT_TOOLS_RANGE_SECONDS = 30 * 24 * 60 * 60 // last 30 days

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

// Day buckets round to the NEAREST day so the default 30-day window gets
// daily buckets rather than rounding up to 2-day ones.
export function pickToolTrendBucketSeconds(rangeMs: number): number {
  const rawSeconds = Math.max(1, Math.floor(rangeMs / 1000 / TARGET_TREND_BUCKETS))
  if (rawSeconds <= HOUR_SECONDS) return HOUR_SECONDS
  if (rawSeconds <= DAY_SECONDS) return Math.ceil(rawSeconds / HOUR_SECONDS) * HOUR_SECONDS
  return Math.max(1, Math.round(rawSeconds / DAY_SECONDS)) * DAY_SECONDS
}

type ToolStatusKey = "unused" | "failing" | "noDefinition"

export function getToolStatuses(tool: ToolSummaryRecord): readonly ToolStatusKey[] {
  const statuses: ToolStatusKey[] = []
  if (tool.metrics === null) statuses.push("unused")
  if (tool.metrics !== null && tool.metrics.errorRate >= TOOL_FAILING_ERROR_RATE) statuses.push("failing")
  if (tool.offeredCount === 0) statuses.push("noDefinition")
  return statuses
}

export function formatBucketLabel(bucketStartIso: string, bucketSeconds: number): string {
  const date = new Date(bucketStartIso)
  if (Number.isNaN(date.getTime())) return bucketStartIso
  if (bucketSeconds < DAY_SECONDS) {
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
