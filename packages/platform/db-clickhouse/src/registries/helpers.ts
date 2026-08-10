import type { FilterCondition } from "@domain/shared"

export function dateTime64BestEffortExpression(paramName: string, options: { readonly array: boolean }): string {
  const parse = (value: string) => `parseDateTime64BestEffort(${value}, 9, 'UTC')`
  if (options.array) return `arrayMap(x -> ${parse("x")}, {${paramName}:Array(String)})`
  return parse(`{${paramName}:String}`)
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

/**
 * Which rows belong to a session, for a table whose `session_id` is the raw span value.
 *
 * Mirrors the `sessions_mv` grouping key, `coalesce(nullIf(session_id, ''), toString(trace_id))`:
 * a conversation-id session matches on `session_id`, and an orphan single-trace session — whose
 * `session_id` is empty — matches on its `trace_id`. Both rollups are right to store what they
 * store: the sessions key must coalesce, because it groups, while an empty `session_id` on a trace
 * means "no conversation", which is a distinction the product relies on. So the two are bridged on
 * read, here.
 *
 * Split into bare column equalities rather than the coalesce form, which wraps both columns in
 * functions and defeats the `idx_session_id` / `idx_trace_id` bloom-filter skip indexes — that
 * scanned every granule of the org/project. Orphan session ids are 32-hex trace ids, so any other
 * length cannot match a `FixedString(32)` trace_id and the trace arm is dropped; `toFixedString` on
 * a longer value would throw.
 */
export const sessionMembershipClause = (
  sessionId: string,
  paramPrefix: string,
): { readonly clause: string; readonly params: Record<string, string> } => {
  if (sessionId.length === 0) return { clause: "1 = 0", params: {} }

  const idParam = `${paramPrefix}_session_id`
  if (sessionId.length === 32) {
    const traceParam = `${paramPrefix}_session_trace_id`
    return {
      clause: `(session_id = {${idParam}:String} OR (session_id = '' AND trace_id = {${traceParam}:FixedString(32)}))`,
      params: { [idParam]: sessionId, [traceParam]: sessionId },
    }
  }
  return { clause: `session_id = {${idParam}:String}`, params: { [idParam]: sessionId } }
}

/**
 * `sessionMembershipClause` for a fragment of an id rather than a whole one, which is what the
 * filter box sends — every text filter debounces into `contains`.
 *
 * No length gate on the trace arm: a fragment is shorter than the 32-hex id it matches, so the
 * orphan half cannot be dropped on length the way the exact form drops it. Substring matching
 * cannot use the bloom-filter skip indexes either way, so `toString` on the trace id costs nothing
 * that the operator has not already spent.
 */
const partialSessionMembershipClause = (
  fragment: string,
  paramPrefix: string,
): { readonly clause: string; readonly params: Record<string, string> } => {
  const param = `${paramPrefix}_session_fragment`
  return {
    clause: `(session_id ILIKE {${param}:String} OR (session_id = '' AND toString(trace_id) ILIKE {${param}:String}))`,
    params: { [param]: `%${fragment}%` },
  }
}

type MembershipClauseBuilder = (
  value: string,
  paramPrefix: string,
) => { readonly clause: string; readonly params: Record<string, string> }

const MEMBERSHIP_BUILDER_BY_OP: Readonly<Record<string, MembershipClauseBuilder | undefined>> = {
  eq: sessionMembershipClause,
  in: sessionMembershipClause,
  neq: sessionMembershipClause,
  notIn: sessionMembershipClause,
  contains: partialSessionMembershipClause,
  notContains: partialSessionMembershipClause,
}

const NEGATED_MEMBERSHIP_OPS: ReadonlySet<string> = new Set(["neq", "notIn", "notContains"])

/**
 * A `sessionId` filter that resolves session membership rather than raw column equality.
 *
 * Every operator the field supported as a plain column is answered here, because the field is
 * reachable from the filter UI and from any API caller: an operator that throws would surface as an
 * unhandled defect rather than as a rejected filter. Ordering comparisons on an opaque id stay
 * unsupported, as they were meaningless on the column too.
 */
export function buildSessionMembershipClause(
  cond: FilterCondition,
  paramPrefix: string,
): { readonly clause: string; readonly params: Record<string, unknown> } {
  const build = MEMBERSHIP_BUILDER_BY_OP[cond.op]
  if (!build) throw new Error(`Unsupported sessionId filter operator: ${cond.op}`)

  const values = (Array.isArray(cond.value) ? cond.value : [cond.value]).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  )
  const negated = NEGATED_MEMBERSHIP_OPS.has(cond.op)
  if (values.length === 0) return { clause: negated ? "1 = 1" : "1 = 0", params: {} }

  const parts = values.map((value, index) => build(value, `${paramPrefix}_${index}`))
  const membership = `(${parts.map((part) => part.clause).join(" OR ")})`

  return {
    clause: negated ? `NOT ${membership}` : membership,
    params: Object.assign({}, ...parts.map((part) => part.params)),
  }
}

const COMPARISON_SQL_OPS: Readonly<Record<string, string>> = {
  eq: "=",
  neq: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
}

const CACHE_HIT_RATE_DENOM = "(tokens_input + tokens_cache_read + tokens_cache_create)"
const CACHE_HIT_RATE_EXPR = `(tokens_cache_read / ${CACHE_HIT_RATE_DENOM})`

/**
 * Cache hit rate is a ratio of aggregated token sums, so it filters via HAVING
 * against the SELECT aliases (`tokens_cache_read` etc. are `sum(...) AS ...`).
 * Rows with no input-side tokens have an undefined rate and must not match any
 * threshold, so the divide-by-zero is guarded explicitly. The wire value is an
 * integer percentage (0–100), so it is divided by 100 to compare against the
 * 0..1 ratio.
 */
export function buildCacheHitRateClause(
  cond: FilterCondition,
  paramPrefix: string,
): { readonly clause: string; readonly params: Record<string, unknown> } {
  const sqlOp = COMPARISON_SQL_OPS[cond.op]
  if (!sqlOp) throw new Error(`Unsupported cacheHitRate filter operator: ${cond.op}`)
  return {
    clause: `(${CACHE_HIT_RATE_DENOM} > 0 AND ${CACHE_HIT_RATE_EXPR} ${sqlOp} {${paramPrefix}:Float64} / 100)`,
    params: { [paramPrefix]: cond.value },
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
