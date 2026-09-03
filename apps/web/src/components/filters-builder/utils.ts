import type { FilterCondition, FilterSet } from "@domain/shared"
import type { MetadataEntry } from "./metadata-filter/use-metadata-filter.ts"
import type { StatusFilterValue } from "./status-filter.tsx"

const STATUS_VALUES: readonly StatusFilterValue[] = ["ok", "error"]

/**
 * Selected values for a multi-select field. The controls write `in`, but a predicate can arrive
 * from anywhere the filter contract is honoured — a monitor target, an API- or MCP-created saved
 * search — and those spell a single value as `eq`. Reading only `in` left such a filter applied to
 * the results yet invisible in the sidebar; editing the control rewrites it as `in`.
 */
export function getInValues(filters: FilterSet, field: string): readonly string[] {
  const conditions = filters[field]
  const inCondition = conditions?.find((c) => c.op === "in")
  if (Array.isArray(inCondition?.value)) return inCondition.value.map(String)
  const eqCondition = conditions?.find((c) => c.op === "eq")
  const eqValue = eqCondition?.value
  if (typeof eqValue === "string" || typeof eqValue === "number" || typeof eqValue === "boolean") {
    return [String(eqValue)]
  }
  return []
}

export function getTextFilterValue(filters: FilterSet, field: string): string {
  const cond = filters[field]?.find((c) => c.op === "contains")
  return typeof cond?.value === "string" ? cond.value : ""
}

export function getRangeValues(
  filters: FilterSet,
  field: string,
): { min: number | undefined; max: number | undefined } {
  const conditions = filters[field]
  const minVal = conditions?.find((c) => c.op === "gte")?.value
  const maxVal = conditions?.find((c) => c.op === "lte")?.value
  return {
    min: typeof minVal === "number" ? minVal : undefined,
    max: typeof maxVal === "number" ? maxVal : undefined,
  }
}

export function getPercentileValue(filters: FilterSet, field: string): number | undefined {
  const cond = filters[field]?.find((c) => c.op === "gtePercentile")
  return typeof cond?.value === "number" ? cond.value : undefined
}

export function getStatusValues(filters: FilterSet, field: string): readonly StatusFilterValue[] {
  return getInValues(filters, field).filter((v): v is StatusFilterValue =>
    (STATUS_VALUES as readonly string[]).includes(v),
  )
}

/** Set (or, when `conditions` is empty, remove) a field's conditions. */
export function setFieldConditions(filters: FilterSet, field: string, conditions: FilterCondition[]): FilterSet {
  if (conditions.length === 0) {
    const { [field]: _removed, ...rest } = filters
    return rest
  }
  return { ...filters, [field]: conditions }
}

/** Convert a wire value to its display unit (e.g. ns → seconds via `displayScale`). */
export function toDisplayUnit(value: number | undefined, displayScale: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!displayScale) return value
  return value / displayScale
}

/** Convert a display value back to its wire unit, rounding to avoid float drift. */
export function toWireUnit(value: number | undefined, displayScale: number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!displayScale) return value
  return Math.round(value * displayScale)
}

export function hasMetadataFilters(filters: FilterSet): boolean {
  return Object.keys(filters).some((field) => field.startsWith("metadata."))
}

/** The `metadata.<key> = value` conditions as flat entries for `MetadataFilter`. */
export function metadataEntriesFromFilters(filters: FilterSet): MetadataEntry[] {
  const entries: MetadataEntry[] = []
  for (const [field, conditions] of Object.entries(filters)) {
    if (!field.startsWith("metadata.")) continue
    const key = field.slice("metadata.".length)
    for (const cond of conditions) {
      if (cond.op === "eq" && typeof cond.value === "string") entries.push({ key, value: cond.value })
    }
  }
  return entries
}

/**
 * Replace all `metadata.*` keys with the given entries. `MetadataFilter` emits partial rows on
 * every keystroke, so incomplete rows are dropped — persisting `metadata.` (empty key/value)
 * would be rejected by `filterSetSchema`.
 */
export function applyMetadataEntries(filters: FilterSet, entries: readonly MetadataEntry[]): FilterSet {
  const next: Record<string, readonly FilterCondition[]> = {}
  for (const [field, conditions] of Object.entries(filters)) {
    if (!field.startsWith("metadata.")) next[field] = conditions
  }
  for (const entry of entries) {
    if (entry.key === "" || entry.value === "") continue
    next[`metadata.${entry.key}`] = [{ op: "eq", value: entry.value }]
  }
  return next
}

/** Remove every `metadata.*` key. */
export function removeMetadataFilters(filters: FilterSet): FilterSet {
  const next: Record<string, readonly FilterCondition[]> = {}
  for (const [field, conditions] of Object.entries(filters)) {
    if (!field.startsWith("metadata.")) next[field] = conditions
  }
  return next
}
