import type { ScoreBreakdownField, ScoreMetric } from "@domain/shared"
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

/**
 * One row per score (the signal grain), windowed on `created_at` (a
 * `DateTime64(3)` column — note the scale). Each score is left-joined to its
 * trace's rollup so a breakdown can group by a trace dimension; scores without a
 * trace keep NULL/empty dims and drop out of trace-dim breakdowns.
 */
const buildInner = (input: MetricSqlInput): Effect.Effect<InnerQuery, never, never> =>
  Effect.sync(() => {
    const { clauses, params: filterParams } = buildClickHouseWhere(input.target.filterSet, SCORE_FIELD_REGISTRY)
    const extraWhere = clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : ""
    return {
      sql: `SELECT
              sc.signal_id AS signal_id, sc.source AS source, sc.value AS value,
              sc.passed AS passed, sc.errored AS errored, sc.created_at AS created_at,
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
              GROUP BY organization_id, project_id, trace_id
            ) tr ON sc.trace_id = tr.trace_id
            WHERE sc.organization_id = {organizationId:String}
              AND sc.project_id = {projectId:String}
              AND sc.created_at >= toDateTime64({windowFrom:String}, 3, 'UTC')
              AND sc.created_at < toDateTime64({windowTo:String}, 3, 'UTC')
              ${extraWhere}`,
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

export const scoresDescriptor: StreamDescriptor = {
  buildInner,
  aggregate: (metric) => scoreAggregate(metric as ScoreMetric),
  breakdowns: BREAKDOWN,
  timeColumn: "created_at",
}
