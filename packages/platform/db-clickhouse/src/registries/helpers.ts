import type { FilterCondition } from "@domain/shared"

/**
 * Shared `mapValue` helpers for ClickHouse field registries (`trace-fields`, `session-fields`, …).
 */

/**
 * ClickHouse `DateTime64(9, 'UTC')` bound parameters reject typical JS `toISOString()` output with a
 * trailing `Z` (BAD_QUERY_PARAMETER: parsed incompletely — the `Z` is an extra byte). Normalize to
 * `YYYY-MM-DD HH:MM:SS.sss...` without a timezone suffix so parameterized queries bind correctly.
 */
export function mapDateTime64UtcQueryParam(value: FilterCondition["value"]): FilterCondition["value"] {
  if (typeof value !== "string") return value
  const t = value.trim()
  const withoutZ = t.endsWith("Z") ? t.slice(0, -1) : t
  return withoutZ.replace("T", " ")
}

const STATUS_TO_INT: Record<string, number> = { unset: 0, ok: 1, error: 2 }

export function mapStatusValue(value: FilterCondition["value"]): FilterCondition["value"] {
  if (Array.isArray(value)) {
    return value.map((v) => STATUS_TO_INT[String(v)] ?? -1).filter((n) => n >= 0)
  }
  return STATUS_TO_INT[String(value)] ?? -1
}
