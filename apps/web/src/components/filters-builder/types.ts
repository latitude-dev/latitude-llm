import type { TRACE_FILTER_FIELDS, TraceFilterFieldType } from "@domain/shared"

type MultiSelectField = Extract<(typeof TRACE_FILTER_FIELDS)[number], { type: "multiSelect" }>
export type DistinctColumn = MultiSelectField["field"]

export type FilterType = TraceFilterFieldType | "metadata"

export interface ActiveFilter {
  type: FilterType
  field: string
  label: string
}
