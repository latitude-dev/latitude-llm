import {
  isPercentileSessionFilterField,
  isPercentileTraceFilterField,
  type PercentileSessionFilterField,
  type PercentileTraceFilterField,
  TRACE_FILTER_FIELDS,
} from "@domain/shared"
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

export const STATUS_FIELDS = TRACE_FILTER_FIELDS.filter((f) => f.type === "status").map((f) => ({
  field: f.field,
  label: f.label,
}))

export type PercentileFieldName = PercentileTraceFilterField | PercentileSessionFilterField

interface NumberRangeFieldDefinition {
  readonly field: string
  readonly label: string
  readonly tooltip: string | undefined
  readonly percentile?: {
    readonly field?: PercentileFieldName
  }
}

export const NUMBER_RANGE_FIELDS: readonly NumberRangeFieldDefinition[] = TRACE_FILTER_FIELDS.filter(
  (f) => f.type === "numberRange",
).map((f) => {
  const supportsPercentile = "percentile" in f ? f.percentile === true : false
  // Today `PERCENTILE_TRACE_FILTER_FIELDS === PERCENTILE_SESSION_FILTER_FIELDS`,
  // so this OR is redundant; checking both keeps the percentile UI wired up
  // if a session-only percentile field is added later (otherwise it would
  // silently fall to `{}` and `PercentileFilter` would render nothing).
  const isPercentileField = isPercentileTraceFilterField(f.field) || isPercentileSessionFilterField(f.field)
  return {
    field: f.field,
    label: f.label,
    tooltip: "tooltip" in f ? f.tooltip : undefined,
    ...(supportsPercentile ? { percentile: isPercentileField ? { field: f.field } : {} } : {}),
  }
})

export function getTextFieldsForMode(mode: FilterMode) {
  if (mode === "sessions") {
    return TEXT_FIELDS.map((f) =>
      f.field === "traceId" ? { ...f, placeholder: "Enter full trace ID (32 chars)…" } : f,
    )
  }
  return TEXT_FIELDS
}
