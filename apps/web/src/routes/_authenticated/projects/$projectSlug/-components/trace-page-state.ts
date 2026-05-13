import { type FilterSet, filterSetSchema } from "@domain/shared"
import type { InfiniteTableSorting } from "@repo/ui"

export const DEFAULT_TRACE_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

export function parseFilters(raw?: string): FilterSet {
  if (!raw) return {}
  try {
    let parsed = JSON.parse(raw)
    // TanStack Router JSON-stringifies search param values. When we store a
    // pre-serialized JSON string (e.g. '{"startTime":...}'), it becomes
    // '"{\"startTime\":...}"' in the URL. Unwrap the extra layer if present.
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed)
    }
    return filterSetSchema.parse(parsed)
  } catch {
    return {}
  }
}

export function serializeFilters(filters: FilterSet): string | undefined {
  const keys = Object.keys(filters)
  return keys.length > 0 ? JSON.stringify(filters) : undefined
}

export function getTimeFilterValue(filters: FilterSet, op: "gte" | "lte"): string | undefined {
  const conds = filters.startTime
  if (!conds) return undefined
  const match = conds.find((c) => c.op === op)
  return match ? String(match.value) : undefined
}
