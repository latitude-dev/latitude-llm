import { z } from "zod"

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export const FILTER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "contains",
  "notContains",
] as const

export type FilterOperator = (typeof FILTER_OPERATORS)[number]

// ---------------------------------------------------------------------------
// Filter condition & set
// ---------------------------------------------------------------------------

export interface FilterCondition {
  readonly op: FilterOperator
  readonly value: string | number | boolean | readonly (string | number)[]
}

/**
 * Universal filter representation.
 *
 * Field-keyed object where each key maps to an array of conditions.
 * All conditions within a field are AND'd together, and all fields
 * are AND'd across each other.
 *
 * Metadata fields use dot-notation: `metadata.env` maps to
 * `metadata[key]` expressions in SQL adapters.
 *
 * Example:
 * ```json
 * {
 *   "status": [{ "op": "in", "value": ["error"] }],
 *   "cost":   [{ "op": "gte", "value": 10 }, { "op": "lte", "value": 500 }]
 * }
 * ```
 */
export type FilterSet = Readonly<Record<string, readonly FilterCondition[]>>

// ---------------------------------------------------------------------------
// Zod schemas for boundary validation
// ---------------------------------------------------------------------------

/** Max field key length (including metadata. prefix) */
const MAX_KEY_LENGTH = 256
/** Max string value length */
const MAX_VALUE_LENGTH = 1000
/** Max items in an array value (in/notIn) */
const MAX_ARRAY_LENGTH = 100
/** Max conditions per field */
const MAX_CONDITIONS_PER_FIELD = 10
/** Max total fields in a filter set */
const MAX_FIELDS = 30

/** Max metadata path length (excluding `metadata.` prefix) */
const MAX_METADATA_PATH_LENGTH = 200
/** Max metadata nesting depth (`metadata.a.b.c` = depth 3) */
const MAX_METADATA_DEPTH = 12
/** Max length per metadata path segment */
const MAX_METADATA_SEGMENT_LENGTH = 64
/** Metadata path segment chars */
const METADATA_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/

const filterValueSchema = z.union([
  z.string().max(MAX_VALUE_LENGTH),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().max(MAX_VALUE_LENGTH), z.number()])).max(MAX_ARRAY_LENGTH),
])

export const filterConditionSchema = z.object({
  op: z.enum(FILTER_OPERATORS),
  value: filterValueSchema,
})

function isValidMetadataKey(key: string): boolean {
  if (!key.startsWith("metadata.")) return true

  const path = key.slice("metadata.".length)
  if (path.length === 0 || path.length > MAX_METADATA_PATH_LENGTH) return false

  const segments = path.split(".")
  if (segments.length === 0 || segments.length > MAX_METADATA_DEPTH) return false

  return segments.every(
    (segment) =>
      segment.length > 0 && segment.length <= MAX_METADATA_SEGMENT_LENGTH && METADATA_SEGMENT_PATTERN.test(segment),
  )
}

export const filterSetSchema: z.ZodType<FilterSet> = z
  .record(z.string().max(MAX_KEY_LENGTH), z.array(filterConditionSchema).max(MAX_CONDITIONS_PER_FIELD))
  .refine((obj) => Object.keys(obj).length <= MAX_FIELDS, {
    message: `Filter set cannot have more than ${MAX_FIELDS} fields`,
  })
  .refine(
    (obj) => {
      for (const key of Object.keys(obj)) {
        if (!isValidMetadataKey(key)) return false
      }
      return true
    },
    {
      message: "Metadata keys must use dot-notation segments with [a-zA-Z0-9_-], max path length 200, max depth 12",
    },
  )
