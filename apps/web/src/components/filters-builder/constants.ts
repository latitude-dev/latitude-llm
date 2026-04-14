import { STATUS_OPTIONS, TRACE_FILTER_FIELDS } from "@domain/shared"
import type { FilterMode } from "./multi-select-filter.tsx"
import type { DistinctColumn } from "./types.ts"

export { STATUS_OPTIONS }

export const TEXT_FIELDS = TRACE_FILTER_FIELDS.filter((f) => f.type === "text").map((f) => ({
  field: f.field,
  label: f.label,
  placeholder: f.placeholder ?? "Enter value...",
}))

export const MULTI_SELECT_FIELDS = TRACE_FILTER_FIELDS.filter((f) => f.type === "multiSelect").map((f) => ({
  field: f.field as DistinctColumn,
  label: f.label,
}))

export const NUMBER_RANGE_FIELDS = TRACE_FILTER_FIELDS.filter((f) => f.type === "numberRange").map((f) => ({
  field: f.field,
  label: f.label,
  tooltip: "tooltip" in f ? f.tooltip : undefined,
}))

export function getTextFieldsForMode(mode: FilterMode) {
  return mode === "sessions" ? TEXT_FIELDS.filter((f) => f.field !== "name") : TEXT_FIELDS
}
