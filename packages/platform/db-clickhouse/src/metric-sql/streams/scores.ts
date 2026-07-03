import type { ScoreBreakdownField } from "@domain/shared"
import { Effect } from "effect"
import { buildClickHouseWhere } from "../../filter-builder.ts"
import { SCORE_FIELD_REGISTRY } from "../../registries/score-fields.ts"
import { scoreAggregate, windowParams } from "../helpers.ts"
import type { BreakdownExpr, InnerQuery, MetricSqlInput, StreamDescriptor } from "../types.ts"

// `signalId`/`source` are score columns; the trace dims resolve through the
// score's `trace_id` against the traces rollup (joined in the inner query, which
// exposes them as arrays for ARRAY JOIN).
const BREAKDOWN = {
  signalId: { expr: "signal_id", isArray: false },
  source: { expr: "source", isArray: false },
  model: { expr: "models", isArray: true },
  provider: { expr: "providers", isArray: true },
  service: { expr: "service_names", isArray: true },
  tool: { expr: "tools", isArray: true },
  tag: { expr: "tags", isArray: true },
} satisfies Record<ScoreBreakdownField, BreakdownExpr>

// The trace dimensions are exactly the array breakdowns; scalar breakdowns
// (`signalId`/`source`) and filters are all score-native, so only these need the
// traces join. Derived from BREAKDOWN so it can't drift from the breakdown set.
const needsTraceJoin = (breakdown: string | undefined): boolean =>
  breakdown !== undefined && BREAKDOWN[breakdown as ScoreBreakdownField]?.isArray === true

/**
 * One row per score (the signal grain), windowed on `created_at` (a
 * `DateTime64(3)` column — note the scale). When the breakdown is a trace
 * dimension the score is left-joined to its trace's rollup (arrays for ARRAY
 * JOIN; traceless scores keep empty dims and drop out). For scalar breakdowns
 * (`signalId`/`source`) or none, the join is skipped entirely — those columns
 * are never referenced downstream, and filters are all score-native.
 */
const buildInner = (input: MetricSqlInput): Effect.Effect<InnerQuery, never, never> =>
  Effect.sync(() => {
    const { clauses, params: filterParams } = buildClickHouseWhere(input.filterSet, SCORE_FIELD_REGISTRY)
    const extraWhere = clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : ""
    const scoreWhere = `sc.organization_id = {organizationId:String}
              AND sc.project_id = {projectId:String}
              AND sc.created_at >= toDateTime64({windowFrom:String}, 3, 'UTC')
              AND sc.created_at < toDateTime64({windowTo:String}, 3, 'UTC')
              ${extraWhere}`
    const scoreColumns = `sc.signal_id AS signal_id, sc.source AS source, sc.value AS value,
              sc.passed AS passed, sc.errored AS errored, sc.created_at AS created_at`

    const sql = needsTraceJoin(input.breakdown)
      ? `SELECT ${scoreColumns},
              tr.models AS models, tr.providers AS providers, tr.service_names AS service_names,
              tr.tools AS tools, tr.tags AS tags
            FROM scores sc
            LEFT JOIN (
              SELECT trace_id,
                     groupUniqArrayIfMerge(models)        AS models,
                     groupUniqArrayIfMerge(providers)     AS providers,
                     groupUniqArrayIfMerge(service_names) AS service_names,
                     groupUniqArrayIfMerge(tools)         AS tools,
                     groupUniqArrayArray(tags)            AS tags
              FROM traces
              WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
                -- Bound the rollup to the traces referenced by scores in this window,
                -- so we don't aggregate the whole project's traces on every query.
                AND trace_id IN (
                  SELECT DISTINCT trace_id
                  FROM scores
                  WHERE organization_id = {organizationId:String}
                    AND project_id = {projectId:String}
                    AND created_at >= toDateTime64({windowFrom:String}, 3, 'UTC')
                    AND created_at < toDateTime64({windowTo:String}, 3, 'UTC')
                    AND trace_id != ''
                )
              GROUP BY organization_id, project_id, trace_id
            ) tr ON sc.trace_id = tr.trace_id
            WHERE ${scoreWhere}`
      : `SELECT ${scoreColumns}
            FROM scores sc
            WHERE ${scoreWhere}`

    return {
      sql,
      params: {
        ...windowParams({
          organizationId: input.organizationId as string,
          projectId: input.projectId as string,
          from: input.from,
          to: input.to,
        }),
        ...filterParams,
      },
    }
  })

export const scoresDescriptor: StreamDescriptor<"scores"> = {
  buildInner,
  aggregate: (metric) => scoreAggregate(metric),
  breakdowns: BREAKDOWN,
  timeColumn: "created_at",
}
