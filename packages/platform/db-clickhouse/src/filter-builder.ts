import type { FilterCondition, FilterOperator, FilterSet } from "@domain/shared"
import { isValidationError, ValidationError } from "@domain/shared"
import { Effect } from "effect"

// ---------------------------------------------------------------------------
// ClickHouse-specific field mapping
// ---------------------------------------------------------------------------

export interface ScalarFieldMapping {
  readonly column: string
  readonly chType: string
  readonly isArray?: boolean
  readonly arrayContains?: boolean
  readonly mapValue?: (value: FilterCondition["value"]) => FilterCondition["value"]
  readonly valueExpression?: (paramName: string, options: { readonly array: boolean }) => string
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

const INTEGER_CH_TYPE = /^(?:U?Int(?:8|16|32|64))$/

const isIntegerChType = (chType: string): boolean => INTEGER_CH_TYPE.test(chType)

const assertIntegerFilterValue = (field: string, value: FilterCondition["value"]): void => {
  const values = Array.isArray(value) ? value : [value]
  for (const item of values) {
    if (typeof item === "number" && !Number.isInteger(item)) {
      throw new ValidationError({
        field,
        message: `Filter value for '${field}' must be an integer (got ${item}). Numeric filters use storage units (for example cost in microcents, duration in nanoseconds).`,
      })
    }
  }
}

const FIXED_STRING_CH_TYPE = /^FixedString\((\d+)\)$/

const fixedStringByteLength = (chType: string): number | undefined => {
  const match = FIXED_STRING_CH_TYPE.exec(chType)
  return match ? Number(match[1]) : undefined
}

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length

/** Ops whose SQL negates the match, so a value that can never match should make the clause always true. */
const NEGATED_FIXED_STRING_OPS: ReadonlySet<string> = new Set(["neq", "notContains"])

/**
 * FixedString(N) columns store up to N bytes, right-padded with '\0' when shorter — ClickHouse only
 * rejects a value outright ("Too large value for FixedString(N)") when it *exceeds* N bytes, so
 * binding an over-long id as a query param would 500 instead of returning zero rows. `in`/`notIn`
 * values are filtered to fit (ClickHouse binds an empty array fine); other ops degrade to a static
 * clause before an over-long value ever reaches ClickHouse — mirroring how `sessionMembershipClause`
 * (registries/helpers.ts) drops the mismatched-length trace arm.
 */
const sanitizeFixedStringArrayValue = (
  value: FilterCondition["value"],
  byteLength: number,
): FilterCondition["value"] => {
  const values = Array.isArray(value) ? value : [value]
  return values.filter((item): item is string => typeof item === "string" && utf8ByteLength(item) <= byteLength)
}

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
      const resolved = resolveScalarCondition(field, mapping, cond, p)
      clauses.push(resolved.clause)
      if (resolved.param) {
        params[p] = resolved.value
      }
    }
  }

  return { clauses, params }
}

/** Run synchronous filter SQL building inside Effect, surfacing `ValidationError` as a typed failure. */
export const runFilterBuild = <A>(build: () => A): Effect.Effect<A, ValidationError> =>
  Effect.try({
    try: build,
    catch: (cause) => {
      if (isValidationError(cause)) return cause
      throw cause
    },
  })

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ResolvedCondition =
  | { readonly clause: string; readonly param: true; readonly value: FilterCondition["value"] }
  | { readonly clause: string; readonly param: false }

/** Resolves one filter condition on a scalar field mapping to a SQL clause and its param value, if any. */
function resolveScalarCondition(
  field: string,
  mapping: ScalarFieldMapping,
  cond: FilterCondition,
  paramName: string,
): ResolvedCondition {
  let value: FilterCondition["value"] = mapping.mapValue ? mapping.mapValue(cond.value) : cond.value
  if (isIntegerChType(mapping.chType)) {
    assertIntegerFilterValue(field, value)
  }
  const ilikeWrap = (cond.op === "contains" || cond.op === "notContains") && !(mapping.isArray && mapping.arrayContains)

  // ILIKE binds its pattern as `:String` regardless of column type, so only the non-ILIKE paths
  // (which bind `:FixedString(N)` / `:Array(FixedString(N))`) risk the ClickHouse parse error.
  const fixedStringLength = ilikeWrap ? undefined : fixedStringByteLength(mapping.chType)
  if (fixedStringLength !== undefined) {
    if (cond.op === "in" || cond.op === "notIn") {
      value = sanitizeFixedStringArrayValue(value, fixedStringLength)
    } else {
      const scalar = Array.isArray(value) ? value[0] : value
      if (typeof scalar !== "string" || utf8ByteLength(scalar) > fixedStringLength) {
        return { clause: NEGATED_FIXED_STRING_OPS.has(cond.op) ? "1 = 1" : "1 = 0", param: false }
      }
    }
  }

  if (ilikeWrap && typeof value === "string") {
    value = `%${value}%`
  }
  return { clause: buildClause(mapping, paramName, cond), param: true, value }
}

function buildClause(mapping: ScalarFieldMapping, paramName: string, cond: FilterCondition): string {
  const { column, chType, isArray, arrayContains } = mapping
  const scalarValue = mapping.valueExpression?.(paramName, { array: false }) ?? `{${paramName}:${chType}}`
  const arrayValue = mapping.valueExpression?.(paramName, { array: true }) ?? `{${paramName}:Array(${chType})}`

  // Array fields: in/notIn use hasAny
  if (isArray && (cond.op === "in" || cond.op === "notIn")) {
    return cond.op === "in" ? `hasAny(${column}, ${arrayValue})` : `NOT hasAny(${column}, ${arrayValue})`
  }

  if (isArray && arrayContains && (cond.op === "eq" || cond.op === "contains")) {
    return `has(${column}, ${scalarValue})`
  }
  if (isArray && arrayContains && (cond.op === "neq" || cond.op === "notContains")) {
    return `NOT has(${column}, ${scalarValue})`
  }

  // Scalar in/notIn
  if (cond.op === "in" || cond.op === "notIn") {
    const not = cond.op === "notIn" ? "NOT " : ""
    if (mapping.valueExpression) return `${not}has(${arrayValue}, ${column})`
    return `${column} ${not}IN (${arrayValue})`
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
    return `${column} ${sqlOp} ${scalarValue}`
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
