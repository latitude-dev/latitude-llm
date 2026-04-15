import type { FilterCondition, FilterSet } from "@domain/shared"

export function getInValues(filters: FilterSet, field: string): readonly string[] {
  const cond = filters[field]?.find((c) => c.op === "in")
  return Array.isArray(cond?.value) ? cond.value.map(String) : []
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

export function setFieldConditions(filters: FilterSet, field: string, conditions: FilterCondition[]): FilterSet {
  if (conditions.length === 0) {
    const { [field]: _, ...rest } = filters
    return rest
  }
  return { ...filters, [field]: conditions }
}
