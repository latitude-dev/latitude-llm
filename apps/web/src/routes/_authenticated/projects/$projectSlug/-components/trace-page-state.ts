import { type FilterSet, filterSetSchema } from "@domain/shared"
import type { InfiniteTableSorting } from "@repo/ui"

export const DEFAULT_TRACE_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

/**
 * Sort identifier sent to the API when search is active and the user
 * hasn't picked an explicit sort column. The repository's `SORT_COLUMNS`
 * has no entry for `"relevance"`, so it falls through to the default
 * relevance-ranked path (best_score for sessions, relevance_score for
 * traces). Picking any other axis from the column-header click keeps the
 * relevance floor (>= 0.3) but swaps the primary sort.
 */
export const RELEVANCE_SORT_COLUMN = "relevance"

export const DEFAULT_SEARCH_SORTING: InfiniteTableSorting = { column: RELEVANCE_SORT_COLUMN, direction: "desc" }

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
