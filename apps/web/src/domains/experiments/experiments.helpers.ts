import type { VariantTimeRange } from "@domain/experiments"
import type { FilterCondition, FilterSet } from "@domain/shared"

/** Session-filter keys that encode a time window rather than a population attribute. */
const TIME_FILTER_KEYS = new Set(["startTime", "endTime"])

/**
 * A saved search made with the time picker stores its window as `startTime` (`gte`/`lte`) conditions
 * inside the filter set. Experiments instead apply `variant.timeRange` as the ClickHouse window, and
 * the filter builder never surfaces `startTime` — so importing those keys verbatim would leave the
 * variant silently constrained by a hidden, un-editable window on top of its own range. Lift the
 * window out of the filter set into an absolute `timeRange`, and drop the time keys from the filters.
 */
export function extractVariantTimeRange(filterSet: FilterSet): { filterSet: FilterSet; timeRange: VariantTimeRange } {
  let from: string | undefined
  let to: string | undefined
  let hasTimeKey = false
  const rest: Record<string, readonly FilterCondition[]> = {}
  for (const [key, conditions] of Object.entries(filterSet)) {
    if (!TIME_FILTER_KEYS.has(key)) {
      rest[key] = conditions
      continue
    }
    hasTimeKey = true
    for (const condition of conditions) {
      if (typeof condition.value !== "string") continue
      if (condition.op === "gte" || condition.op === "gt") from ??= condition.value
      else if (condition.op === "lte" || condition.op === "lt") to ??= condition.value
    }
  }
  if (!hasTimeKey) return { filterSet, timeRange: null }
  const timeRange: VariantTimeRange =
    from !== undefined ? { type: "absolute", fromIso: from, toIso: to ?? new Date().toISOString() } : null
  return { filterSet: rest, timeRange }
}
