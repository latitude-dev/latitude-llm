import type { FilterCondition, FilterSet } from "@domain/shared"

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function startTimeRange(gteMs: number, lteMs: number): FilterCondition[] {
  return [
    { op: "gte", value: new Date(gteMs).toISOString() },
    { op: "lte", value: new Date(lteMs).toISOString() },
  ]
}

/** Rolling last 7 days ending at `anchorNowMs`, plus the immediately prior 7 days for comparison. */
export function buildHomeSevenDayWindow(anchorNowMs: number): {
  readonly currentRange: FilterSet
  readonly compareFilters: FilterSet
  readonly issuesTimeRange: { readonly fromIso: string; readonly toIso: string }
} {
  const toMs = anchorNowMs
  const fromMs = toMs - SEVEN_DAYS_MS
  const prevToMs = fromMs
  const prevFromMs = fromMs - SEVEN_DAYS_MS

  const fromIso = new Date(fromMs).toISOString()
  const toIso = new Date(toMs).toISOString()

  return {
    currentRange: { startTime: startTimeRange(fromMs, toMs) },
    compareFilters: { startTime: startTimeRange(prevFromMs, prevToMs) },
    issuesTimeRange: { fromIso, toIso },
  }
}
