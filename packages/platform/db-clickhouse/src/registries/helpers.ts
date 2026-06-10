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

function collectToolNames(value: FilterCondition["value"]): readonly string[] {
  const raw = Array.isArray(value) ? value : [value]
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0)
}

/**
 * Tool filters have no column on the traces/sessions rollup tables — tools
 * landed after those materialized views, and MVs cannot be backfilled.
 * Resolve them with a subquery over `execute_tool` spans instead. Relies on
 * the outer query binding `{organizationId}` / `{projectId}` — the same
 * contract the score rollup subquery uses.
 */
export function buildToolsClauseFor(groupColumn: "trace_id" | "session_id") {
  return (
    cond: FilterCondition,
    paramPrefix: string,
  ): { readonly clause: string; readonly params: Record<string, unknown> } => {
    const tools = collectToolNames(cond.value)
    const param = `${paramPrefix}_tools`
    const sessionGuard = groupColumn === "session_id" ? "\n          AND session_id != ''" : ""
    const subquery = `${groupColumn} IN (
        SELECT DISTINCT ${groupColumn}
        FROM spans
        WHERE organization_id = {organizationId:String}
          AND project_id = {projectId:String}
          AND operation = 'execute_tool'
          AND tool_name IN ({${param}:Array(String)})${sessionGuard}
      )`

    switch (cond.op) {
      case "eq":
      case "in": {
        if (tools.length === 0) return { clause: "1 = 0", params: {} }
        return { clause: subquery, params: { [param]: tools } }
      }
      case "neq":
      case "notIn": {
        if (tools.length === 0) return { clause: "1 = 1", params: {} }
        return { clause: `NOT (${subquery})`, params: { [param]: tools } }
      }
      default:
        throw new Error(`Unsupported tools filter operator: ${cond.op}`)
    }
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
