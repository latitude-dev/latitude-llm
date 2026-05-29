import type { FilterCondition, FilterSet } from "./filter.ts"

/** Operators exposed in the UI for array-valued multi-select fields (tags, models, …). */
export const MULTI_SELECT_ARRAY_OPS = ["in", "notIn", "all"] as const

export type MultiSelectArrayOp = (typeof MULTI_SELECT_ARRAY_OPS)[number]

export const MULTI_SELECT_ARRAY_OP_LABELS: Readonly<Record<MultiSelectArrayOp, string>> = {
  in: "Contains any of",
  notIn: "Does not contain any of",
  all: "Contains all of",
}

function valuesFromArrayCondition(cond: FilterCondition | undefined): readonly string[] {
  if (!cond || !Array.isArray(cond.value)) return []
  return cond.value.map(String)
}

function valuesFromScalarConditions(conditions: readonly FilterCondition[], op: "eq" | "neq"): readonly string[] {
  return conditions.filter((c) => c.op === op && typeof c.value === "string").map((c) => String(c.value))
}

/**
 * Reads the multi-select filter state for an array field from a {@link FilterSet}.
 * Defaults to `in` with no values when the field is absent.
 */
export function getMultiSelectArrayFilter(
  filters: FilterSet,
  field: string,
): { readonly op: MultiSelectArrayOp; readonly values: readonly string[] } {
  const conditions = filters[field]
  if (!conditions || conditions.length === 0) {
    return { op: "in", values: [] }
  }

  const inCond = conditions.find((c) => c.op === "in")
  if (inCond) {
    return { op: "in", values: valuesFromArrayCondition(inCond) }
  }

  const notInCond = conditions.find((c) => c.op === "notIn")
  if (notInCond) {
    return { op: "notIn", values: valuesFromArrayCondition(notInCond) }
  }

  const eqValues = valuesFromScalarConditions(conditions, "eq")
  if (eqValues.length > 0 && conditions.every((c) => c.op === "eq")) {
    return { op: "all", values: eqValues }
  }

  // Legacy or hand-authored: multiple `neq` means "excludes each of these tags".
  const neqValues = valuesFromScalarConditions(conditions, "neq")
  if (neqValues.length > 0 && conditions.every((c) => c.op === "neq")) {
    return { op: "notIn", values: neqValues }
  }

  return { op: "in", values: [] }
}

/** Builds filter conditions for an array multi-select field. Empty values → no conditions. */
export function buildMultiSelectArrayFilter(
  op: MultiSelectArrayOp,
  values: readonly string[],
): readonly FilterCondition[] {
  if (values.length === 0) return []

  switch (op) {
    case "in":
      return [{ op: "in", value: [...values] }]
    case "notIn":
      return [{ op: "notIn", value: [...values] }]
    case "all":
      return values.map((value) => ({ op: "eq" as const, value }))
  }
}
