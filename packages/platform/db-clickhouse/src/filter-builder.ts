import type { FieldFilter } from "@domain/spans"

/**
 * Describes how a domain field name maps to a ClickHouse SQL expression.
 *
 * Define one schema per table/entity type and pass it to buildFilters.
 */
export interface ColumnDef {
  /** SQL expression used in comparisons, e.g. "trace_id" or "sum(span_count)" */
  readonly expr: string
  /** Determines which SQL constructor to use for the filter */
  readonly kind: "string" | "number" | "date" | "array"
  /** WHERE applies before GROUP BY; HAVING applies after aggregation */
  readonly clause: "where" | "having"
  /**
   * ClickHouse parameter type for {name:Type} placeholders.
   * Examples: 'String', 'UInt64', "DateTime64(9, 'UTC')"
   */
  readonly chType: string
  /**
   * Optional value transformer applied before parameterization.
   * Useful for enum-to-integer conversions, etc.
   */
  readonly transform?: (value: unknown) => unknown
}

export type ColumnSchema = Readonly<Record<string, ColumnDef>>

export interface BuiltFilters {
  readonly whereFragments: readonly string[]
  readonly havingFragments: readonly string[]
  readonly params: Readonly<Record<string, unknown>>
  /** Field names from the input that had no matching column in the schema. */
  readonly unknownFields: readonly string[]
}

const EMPTY: BuiltFilters = { whereFragments: [], havingFragments: [], params: {}, unknownFields: [] }

function toClickhouseDatetime(iso: string): string {
  return iso.replace("Z", "")
}

function wildcardToLike(value: string): string {
  return value.replace(/\*/g, "%")
}

function numericOpToSql(op: "eq" | "gt" | "gte" | "lt" | "lte"): string {
  switch (op) {
    case "eq":
      return "="
    case "gt":
      return ">"
    case "gte":
      return ">="
    case "lt":
      return "<"
    case "lte":
      return "<="
  }
}

function buildFragment(
  filter: FieldFilter,
  col: ColumnDef,
  idx: number,
): { fragment: string; params: Record<string, unknown> } {
  const { expr, chType, transform } = col
  const p = `f${idx}` // unique param prefix for this filter
  const neg = filter.negated ? "NOT " : ""

  const applyTransform = (v: unknown) => (transform ? transform(v) : v)

  if (filter.type === "string") {
    if (filter.op === "like") {
      const likeVal = wildcardToLike(filter.value)
      return {
        fragment: `${neg}(${expr} LIKE {${p}_v:${chType}})`,
        params: { [`${p}_v`]: applyTransform(likeVal) },
      }
    }
    // eq
    return {
      fragment: `${neg}(${expr} = {${p}_v:${chType}})`,
      params: { [`${p}_v`]: applyTransform(filter.value) },
    }
  }

  if (filter.type === "number") {
    if (filter.op === "between") {
      return {
        fragment: `${neg}(${expr} BETWEEN {${p}_min:${chType}} AND {${p}_max:${chType}})`,
        params: {
          [`${p}_min`]: applyTransform(filter.min),
          [`${p}_max`]: applyTransform(filter.max),
        },
      }
    }
    return {
      fragment: `${neg}(${expr} ${numericOpToSql(filter.op)} {${p}_v:${chType}})`,
      params: { [`${p}_v`]: applyTransform(filter.value) },
    }
  }

  if (filter.type === "date") {
    if (filter.op === "between") {
      return {
        fragment: `${neg}(${expr} BETWEEN {${p}_min:${chType}} AND {${p}_max:${chType}})`,
        params: {
          [`${p}_min`]: toClickhouseDatetime(filter.min),
          [`${p}_max`]: toClickhouseDatetime(filter.max),
        },
      }
    }
    return {
      fragment: `${neg}(${expr} ${numericOpToSql(filter.op)} {${p}_v:${chType}})`,
      params: { [`${p}_v`]: toClickhouseDatetime(filter.value) },
    }
  }

  // array — uses ClickHouse has() function
  return {
    fragment: `${neg}has(${expr}, {${p}_v:${chType}})`,
    params: { [`${p}_v`]: applyTransform(filter.value) },
  }
}

/**
 * Converts a list of FieldFilters into WHERE/HAVING SQL fragments and
 * query_params, using the provided column schema to map field names to
 * ClickHouse expressions.
 *
 * Unknown fields (not in schema) are silently skipped.
 *
 * @example
 * ```ts
 * const { whereFragments, havingFragments, params } = buildFilters(filters, TRACE_FILTER_SCHEMA)
 * const whereExtra = whereFragments.length ? `AND ${whereFragments.join(' AND ')}` : ''
 * const havingClause = havingFragments.length ? `HAVING ${havingFragments.join(' AND ')}` : ''
 * ```
 */
export function buildFilters(filters: readonly FieldFilter[], schema: ColumnSchema): BuiltFilters {
  if (filters.length === 0) return EMPTY

  const whereFragments: string[] = []
  const havingFragments: string[] = []
  const params: Record<string, unknown> = {}
  const unknownFields: string[] = []

  let idx = 0
  for (const filter of filters) {
    const col = schema[filter.field]
    if (!col) {
      unknownFields.push(filter.field)
      continue
    }

    const { fragment, params: fp } = buildFragment(filter, col, idx++)
    Object.assign(params, fp)

    if (col.clause === "having") {
      havingFragments.push(fragment)
    } else {
      whereFragments.push(fragment)
    }
  }

  return { whereFragments, havingFragments, params, unknownFields }
}
