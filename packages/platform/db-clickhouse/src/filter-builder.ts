import type { FilterCondition, FilterOperator, FilterSet } from "@domain/shared"

// ---------------------------------------------------------------------------
// ClickHouse-specific field mapping
// ---------------------------------------------------------------------------

export interface ChFieldMapping {
  /** SQL column expression or alias used in SELECT/HAVING */
  readonly column: string
  /** ClickHouse parameter type (e.g. "String", "UInt64", "Array(String)") */
  readonly chType: string
  /** Whether this is an array column (in/notIn use hasAny instead of IN) */
  readonly isArray?: boolean
  /**
   * Optional value transform before SQL binding (e.g. status string -> int).
   * Receives the condition value and must return a value suitable for the chType.
   */
  readonly mapValue?: (value: FilterCondition["value"]) => FilterCondition["value"]
}

export type ChFieldRegistry = Readonly<Record<string, ChFieldMapping>>

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

    for (const cond of conditions) {
      const p = `${prefix}_${paramIdx++}`
      let value: FilterCondition["value"] = mapping.mapValue ? mapping.mapValue(cond.value) : cond.value
      if ((cond.op === "contains" || cond.op === "notContains") && typeof value === "string") {
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

function buildClause(mapping: ChFieldMapping, paramName: string, cond: FilterCondition): string {
  const { column, chType, isArray } = mapping

  // Array fields: in/notIn use hasAny
  if (isArray && (cond.op === "in" || cond.op === "notIn")) {
    return cond.op === "in"
      ? `hasAny(${column}, {${paramName}:Array(${chType})})`
      : `NOT hasAny(${column}, {${paramName}:Array(${chType})})`
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
