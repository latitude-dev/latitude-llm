import type { FilterCondition } from "@domain/shared"

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

type StatusEnum = "ok" | "error" | "unset"
const STATUS_FRAGMENTS: Readonly<Record<StatusEnum, string>> = {
  ok: "(error_count = 0 AND span_count > 0)",
  error: "(error_count > 0)",
  unset: "(span_count = 0)",
}

function isStatusEnum(value: unknown): value is StatusEnum {
  return value === "ok" || value === "error" || value === "unset"
}

function collectStatuses(value: FilterCondition["value"]): readonly StatusEnum[] {
  const raw = Array.isArray(value) ? value : [value]
  const out: StatusEnum[] = []
  for (const v of raw) {
    if (isStatusEnum(v) && !out.includes(v)) out.push(v)
  }
  return out
}

export function buildStatusClause(
  cond: FilterCondition,
  _paramPrefix: string,
): { readonly clause: string; readonly params: Record<string, unknown> } {
  const statuses = collectStatuses(cond.value)

  switch (cond.op) {
    case "eq":
    case "in": {
      if (statuses.length === 0) return { clause: "1 = 0", params: {} }
      const disjunction = statuses.map((s) => STATUS_FRAGMENTS[s]).join(" OR ")
      return { clause: `(${disjunction})`, params: {} }
    }
    case "neq":
    case "notIn": {
      if (statuses.length === 0) return { clause: "1 = 1", params: {} }
      const disjunction = statuses.map((s) => STATUS_FRAGMENTS[s]).join(" OR ")
      return { clause: `NOT (${disjunction})`, params: {} }
    }
    default:
      throw new Error(`Unsupported status filter operator: ${cond.op}`)
  }
}

const HAS_LLM_ACTIVITY_FRAGMENT = "(tokens_total > 0 OR length(models) > 0)"

export function buildHasLlmActivityClause(
  cond: FilterCondition,
  _paramPrefix: string,
): { readonly clause: string; readonly params: Record<string, unknown> } {
  const truthy = cond.value === true || cond.value === "true" || cond.value === 1

  switch (cond.op) {
    case "eq":
      return { clause: truthy ? HAS_LLM_ACTIVITY_FRAGMENT : `NOT ${HAS_LLM_ACTIVITY_FRAGMENT}`, params: {} }
    case "neq":
      return { clause: truthy ? `NOT ${HAS_LLM_ACTIVITY_FRAGMENT}` : HAS_LLM_ACTIVITY_FRAGMENT, params: {} }
    default:
      throw new Error(`Unsupported hasLlmActivity filter operator: ${cond.op}`)
  }
}
