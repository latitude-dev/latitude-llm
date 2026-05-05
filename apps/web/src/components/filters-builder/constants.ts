import { isPercentileTraceFilterField, type PercentileTraceFilterField, TRACE_FILTER_FIELDS } from "@domain/shared"
import type { FilterMode } from "./multi-select-filter.tsx"
import type { DistinctColumn } from "./types.ts"

const TEXT_FIELDS = TRACE_FILTER_FIELDS.filter((f) => f.type === "text").map((f) => ({
  field: f.field,
  label: f.label,
  placeholder: f.placeholder ?? "Enter value...",
}))

export const MULTI_SELECT_FIELDS = TRACE_FILTER_FIELDS.filter((f) => f.type === "multiSelect").map((f) => ({
  field: f.field as DistinctColumn,
  label: f.label,
}))

interface NumberRangeFieldDefinition {
  readonly field: string
  readonly label: string
  readonly tooltip: string | undefined
  readonly percentile?: {
    readonly field?: PercentileTraceFilterField
  }
}

export const NUMBER_RANGE_FIELDS: readonly NumberRangeFieldDefinition[] = TRACE_FILTER_FIELDS.filter(
  (f) => f.type === "numberRange",
).map((f) => {
  const supportsPercentile = "percentile" in f ? f.percentile === true : false
  return {
    field: f.field,
    label: f.label,
    tooltip: "tooltip" in f ? f.tooltip : undefined,
    ...(supportsPercentile ? { percentile: isPercentileTraceFilterField(f.field) ? { field: f.field } : {} } : {}),
  }
})

export function getTextFieldsForMode(mode: FilterMode) {
  if (mode === "sessions") {
    return TEXT_FIELDS.filter((f) => f.field !== "name" && f.field !== "traceId")
  }
  return TEXT_FIELDS
}
