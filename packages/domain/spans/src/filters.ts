/**
 * Generic filter types for querying telemetry tables.
 *
 * Table-agnostic — works for traces, spans, and future tables.
 * The ClickHouse adapter maps field names to concrete column expressions.
 *
 * negated is typed as `boolean | undefined` to remain compatible with
 * `exactOptionalPropertyTypes: true` while still accepting Zod-parsed values
 * that include `undefined` as a possible absent value.
 */

export interface StringFilter {
  readonly type: "string"
  /** Domain field name (camelCase), e.g. "rootSpanName", "status" */
  readonly field: string
  /** eq: exact match; like: value may contain * wildcards ("foo*", "*bar*") */
  readonly op: "eq" | "like"
  readonly value: string
  readonly negated?: boolean | undefined
}

export interface NumberFilter {
  readonly type: "number"
  readonly field: string
  readonly op: "eq" | "gt" | "gte" | "lt" | "lte"
  readonly value: number
  readonly negated?: boolean | undefined
}

export interface NumberRangeFilter {
  readonly type: "number"
  readonly field: string
  readonly op: "between"
  readonly min: number
  readonly max: number
  readonly negated?: boolean | undefined
}

export interface DateFilter {
  readonly type: "date"
  readonly field: string
  readonly op: "eq" | "gt" | "gte" | "lt" | "lte"
  /** ISO 8601 string, e.g. "2024-01-15T10:30:00.000Z" */
  readonly value: string
  readonly negated?: boolean | undefined
}

export interface DateRangeFilter {
  readonly type: "date"
  readonly field: string
  readonly op: "between"
  readonly min: string
  readonly max: string
  readonly negated?: boolean | undefined
}

export interface ArrayContainsFilter {
  readonly type: "array"
  readonly field: string
  readonly op: "contains"
  readonly value: string
  readonly negated?: boolean | undefined
}

export type FieldFilter =
  | StringFilter
  | NumberFilter
  | NumberRangeFilter
  | DateFilter
  | DateRangeFilter
  | ArrayContainsFilter
