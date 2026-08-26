import type { BehaviorBreakdownField, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { buildClickHouseWhere, runFilterBuild } from "../../filter-builder.ts"
import { BEHAVIOR_FIELD_REGISTRY } from "../../registries/behavior-fields.ts"
import { behaviorAggregate, windowParams } from "../helpers.ts"
import type { BreakdownExpr, InnerQuery, MetricSqlInput, StreamDescriptor } from "../types.ts"

// All behavior dims are direct scalar columns on `taxonomy_observations` — no join.
const BREAKDOWN = {
  cluster: { expr: "assigned_cluster_id", isArray: false },
  session: { expr: "session_id", isArray: false },
  method: { expr: "assignment_method", isArray: false },
} satisfies Record<BehaviorBreakdownField, BreakdownExpr>

/** One row per taxonomy observation, windowed on `start_time` (DateTime64(9)). */
const buildInner = (input: MetricSqlInput<"behaviors">): Effect.Effect<InnerQuery, ValidationError, never> =>
  Effect.gen(function* () {
    const { clauses, params: filterParams } = yield* runFilterBuild(() =>
      buildClickHouseWhere(input.filterSet, BEHAVIOR_FIELD_REGISTRY),
    )
    const extraWhere = clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : ""
    return {
      sql: `SELECT assigned_cluster_id, assignment_confidence, assignment_method, session_id, start_time
            FROM taxonomy_observations FINAL
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}
              AND start_time >= toDateTime64({windowFrom:String}, 9, 'UTC')
              AND start_time < toDateTime64({windowTo:String}, 9, 'UTC')
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

export const behaviorsDescriptor: StreamDescriptor<"behaviors"> = {
  buildInner,
  aggregate: (metric) => behaviorAggregate(metric),
  breakdowns: BREAKDOWN,
  timeColumn: "start_time",
  completionTimeColumn: "start_time",
}
