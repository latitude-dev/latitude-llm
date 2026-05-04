import { type FilterSet, filterSetSchema } from "@domain/shared"
import type { InfiniteTableSorting } from "@repo/ui"
import type { BulkSelection, SelectionState } from "../../../../../lib/hooks/useSelectableRows.ts"
import { TRACE_COLUMN_OPTIONS, type TraceColumnId } from "./project-traces-table.tsx"

export const DEFAULT_TRACE_SORTING: InfiniteTableSorting = { column: "startTime", direction: "desc" }

export const DEFAULT_TRACE_COLUMNS: TraceColumnId[] = TRACE_COLUMN_OPTIONS.map((column) => column.id)

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

export function parseTraceColumnIds(raw?: string): TraceColumnId[] {
  const requiredColumnIds = TRACE_COLUMN_OPTIONS.filter((column) => column.required === true).map((column) => column.id)
  const values = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter((value): value is TraceColumnId => TRACE_COLUMN_OPTIONS.some((column) => column.id === value))

  if (!values || values.length === 0) {
    return [...DEFAULT_TRACE_COLUMNS]
  }

  return Array.from(new Set([...requiredColumnIds, ...values]))
}

export function serializeTraceColumnIds(columnIds: readonly TraceColumnId[]): string {
  return Array.from(new Set(["startTime", ...columnIds])).join(",")
}

export function getSelectedCount(state: SelectionState<string>, total: number): number {
  switch (state.mode) {
    case "all":
      return total - state.excludedIds.size
    case "none":
      return 0
    case "partial":
      return state.selectedIds.size
    case "allExcept":
      return total - state.excludedIds.size
  }
}

export function getBulkSelection(state: SelectionState<string>): BulkSelection<string> | null {
  switch (state.mode) {
    case "all":
      return { mode: "all" }
    case "allExcept":
      return { mode: "allExcept", rowIds: Array.from(state.excludedIds) }
    case "partial":
      return state.selectedIds.size > 0 ? { mode: "selected", rowIds: Array.from(state.selectedIds) } : null
    case "none":
      return null
  }
}
