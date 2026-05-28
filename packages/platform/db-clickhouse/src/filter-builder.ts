import type { FilterCondition, FilterOperator, FilterSet } from "@domain/shared"

// ---------------------------------------------------------------------------
// ClickHouse-specific field mapping
// ---------------------------------------------------------------------------

export interface ScalarFieldMapping {
  readonly column: string
  readonly chType: string
  readonly isArray?: boolean
  readonly arrayContains?: boolean
  readonly mapValue?: (value: FilterCondition["value"]) => FilterCondition["value"]
}

export interface SyntheticFieldMapping {
  readonly kind: "synthetic"
  readonly buildClause: (
    cond: FilterCondition,
    paramPrefix: string,
  ) => { readonly clause: string; readonly params: Record<string, unknown> }
}

export type ChFieldMapping = ScalarFieldMapping | SyntheticFieldMapping

function isSyntheticMapping(mapping: ChFieldMapping): mapping is SyntheticFieldMapping {
  return "kind" in mapping && mapping.kind === "synthetic"
}

export type ChFieldRegistry<K extends string = string> = Readonly<Record<K, ChFieldMapping>>

// ---------------------------------------------------------------------------
// Operator -> SQL mapping
// ---------------------------------------------------------------------------

type ScalarOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte"

const SCALAR_OPS: Record<ScalarOp, string> = {
  eq: "=",
  neq: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translates a FilterSet into ClickHouse parameterized WHERE/HAVING clauses.
 *
 * - Unknown fields (not in registry and not metadata.*) are silently skipped.
 * - `metadata.*` fields are handled via dot-notation convention.
 * - Array fields use `hasAny()` for `in`/`notIn` operators.
 * - `contains`/`notContains` use ClickHouse `ILIKE` with auto-wrapped `%` wildcards.
 * - Callers should normalize filters at persistence time (e.g. annotation queue settings); empty `in`/`notIn`
 *   lists still compile to parameterized SQL (typically matching no rows for `in`, all rows for `notIn`).
 *
 * NOTE: `column` and `chType` values from the registry are interpolated into SQL.
 * They must come from hard-coded registries, never from user input.
 */
export function buildClickHouseWhere(
  filters: FilterSet,
  registry: ChFieldRegistry,
  options?: { paramPrefix?: string },
): { clauses: string[]; params: Record<string, unknown> } {
  const prefix = options?.paramPrefix ?? "f"
  const clauses: string[] = []
  const params: Record<string, unknown> = {}
  let paramIdx = 0

  for (const [field, conditions] of Object.entries(filters)) {
    if (!conditions || conditions.length === 0) continue

    // Handle metadata dot-notation
    if (field.startsWith("metadata.")) {
      const metaKey = field.slice("metadata.".length)
      for (const cond of conditions) {
        const p = `${prefix}_${paramIdx++}`
        const kp = `${prefix}_${paramIdx++}`
        let metadataValue: string | readonly string[]

        if (cond.op === "in" || cond.op === "notIn") {
          metadataValue = Array.isArray(cond.value) ? cond.value.map(String) : [String(cond.value)]
        } else {
          const normalized = String(cond.value)
          metadataValue = cond.op === "contains" || cond.op === "notContains" ? `%${normalized}%` : normalized
        }

        params[kp] = metaKey
        params[p] = metadataValue
        clauses.push(buildMetadataClause(kp, p, cond.op))
      }
      continue
    }

    const mapping = registry[field]
    if (!mapping) continue

    if (isSyntheticMapping(mapping)) {
      for (const cond of conditions) {
        const subPrefix = `${prefix}_${paramIdx++}`
        const { clause, params: extraParams } = mapping.buildClause(cond, subPrefix)
        clauses.push(clause)
        Object.assign(params, extraParams)
      }
      continue
    }

    for (const cond of conditions) {
      const p = `${prefix}_${paramIdx++}`
      let value: FilterCondition["value"] = mapping.mapValue ? mapping.mapValue(cond.value) : cond.value
      const ilikeWrap =
        (cond.op === "contains" || cond.op === "notContains") && !(mapping.isArray && mapping.arrayContains)
      if (ilikeWrap && typeof value === "string") {
        value = `%${value}%`
      }
      params[p] = value
      clauses.push(buildClause(mapping, p, cond))
    }
  }

  return { clauses, params }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildClause(mapping: ScalarFieldMapping, paramName: string, cond: FilterCondition): string {
  const { column, chType, isArray, arrayContains } = mapping

  // Array fields: in/notIn use hasAny
  if (isArray && (cond.op === "in" || cond.op === "notIn")) {
    return cond.op === "in"
      ? `hasAny(${column}, {${paramName}:Array(${chType})})`
      : `NOT hasAny(${column}, {${paramName}:Array(${chType})})`
  }

  if (isArray && arrayContains && (cond.op === "eq" || cond.op === "contains")) {
    return `has(${column}, {${paramName}:${chType}})`
  }
  if (isArray && arrayContains && (cond.op === "neq" || cond.op === "notContains")) {
    return `NOT has(${column}, {${paramName}:${chType}})`
  }

  // Scalar in/notIn
  if (cond.op === "in" || cond.op === "notIn") {
    const not = cond.op === "notIn" ? "NOT " : ""
    return `${column} ${not}IN ({${paramName}:Array(${chType})})`
  }

  // contains/notContains use ILIKE
  if (cond.op === "contains") {
    return `${column} ILIKE {${paramName}:String}`
  }
  if (cond.op === "notContains") {
    return `${column} NOT ILIKE {${paramName}:String}`
  }

  // Scalar comparison operators
  const sqlOp = SCALAR_OPS[cond.op as ScalarOp]
  if (sqlOp) {
    return `${column} ${sqlOp} {${paramName}:${chType}}`
  }

  throw new Error(`Unsupported filter operator: ${cond.op}`)
}

function buildMetadataClause(keyParam: string, valueParam: string, op: FilterOperator): string {
  if (op === "in" || op === "notIn") {
    const not = op === "notIn" ? "NOT " : ""
    return `ifNull(metadata[{${keyParam}:String}], '') ${not}IN ({${valueParam}:Array(String)})`
  }

  const sqlOp = SCALAR_OPS[op as ScalarOp]
  if (sqlOp) {
    return `ifNull(metadata[{${keyParam}:String}], '') ${sqlOp} {${valueParam}:String}`
  }
  if (op === "contains") {
    return `ifNull(metadata[{${keyParam}:String}], '') ILIKE {${valueParam}:String}`
  }
  if (op === "notContains") {
    return `ifNull(metadata[{${keyParam}:String}], '') NOT ILIKE {${valueParam}:String}`
  }
  throw new Error(`Unsupported metadata filter operator: ${op}`)
}
