import type { MomentBreakdownField } from "@domain/shared"
import { Effect } from "effect"
import { buildClickHouseWhere } from "../../filter-builder.ts"
import { MOMENT_FIELD_REGISTRY } from "../../registries/moment-fields.ts"
import { momentAggregate, windowParams } from "../helpers.ts"
import type { BreakdownExpr, InnerQuery, MetricSqlInput, StreamDescriptor } from "../types.ts"

// All moment dims are direct scalar columns exposed by the inner subquery.
const BREAKDOWN = {
  kind: { expr: "kind", isArray: false },
  actor: { expr: "actor", isArray: false },
  session: { expr: "session_id", isArray: false },
} satisfies Record<MomentBreakdownField, BreakdownExpr>

/**
 * One row per moment label, windowed on the joined moment's `start_time`
 * (DateTime64(9)). `session_moment_labels` has no timestamp, so an INNER JOIN to
 * `session_semantic_moments` borrows `start_time` (and `coherence_score`) —
 * labels without a resolvable moment/time drop out. Both sides are scoped by
 * organization + project (labels in the outer WHERE, moments inside the joined
 * subquery which also carries the time window) so neither table is scanned
 * cross-tenant and the join can't match a moment from another org/project.
 */
const buildInner = (input: MetricSqlInput<"moments">): Effect.Effect<InnerQuery, never, never> =>
  Effect.sync(() => {
    const { clauses, params: filterParams } = buildClickHouseWhere(input.target.filterSet, MOMENT_FIELD_REGISTRY)
    const extraWhere = clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : ""
    return {
      sql: `SELECT
              lbl.kind AS kind, lbl.actor AS actor, lbl.confidence AS confidence,
              lbl.session_id AS session_id, mom.start_time AS start_time,
              mom.coherence_score AS coherence_score
            FROM session_moment_labels lbl
            INNER JOIN (
              SELECT session_id, analysis_hash, moment_id, start_time, coherence_score
              FROM session_semantic_moments
              WHERE organization_id = {organizationId:String}
                AND project_id = {projectId:String}
                AND start_time >= toDateTime64({windowFrom:String}, 9, 'UTC')
                AND start_time < toDateTime64({windowTo:String}, 9, 'UTC')
            ) mom
              ON lbl.session_id = mom.session_id
              AND lbl.analysis_hash = mom.analysis_hash
              AND lbl.moment_id = mom.moment_id
            WHERE lbl.organization_id = {organizationId:String}
              AND lbl.project_id = {projectId:String}
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

export const momentsDescriptor: StreamDescriptor<"moments"> = {
  buildInner,
  aggregate: (metric) => momentAggregate(metric),
  breakdowns: BREAKDOWN,
  timeColumn: "start_time",
}
