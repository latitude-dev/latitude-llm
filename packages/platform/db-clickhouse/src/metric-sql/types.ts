import type {
  ChSqlClient,
  FilterSet,
  MonitorMetric,
  MonitorStream,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import type { Effect } from "effect"

/**
 * The minimal window input the SQL builders need: a resolved stream + predicate
 * (+ optional semantic query) and the metric to compute. Structurally a subset
 * of `MetricSeriesWindowInput` (monitors) and the analytics-query input, so both
 * readers pass straight through without a shared port dependency.
 */
export interface MetricSqlInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly target: {
    readonly stream: MonitorStream
    readonly filterSet: FilterSet
    /** Semantic search query — `traces` stream only; `null` otherwise. */
    readonly query: string | null
    readonly metric: MonitorMetric
  }
  /** Inclusive lower bound on the row's time axis. */
  readonly from: Date
  /** Exclusive upper bound. */
  readonly to: Date
}

export type InnerQuery = {
  readonly sql: string
  readonly params: Record<string, unknown>
  readonly clickhouseSettings?: Record<string, string | number | boolean>
}

/**
 * A breakdown dimension's expression over the inner subquery's output columns.
 * Array dims (`models`, `tags`, …) are `ARRAY JOIN`-exploded so one entity
 * contributes a row per distinct value; `count`/`uniqExact` then stay correct
 * per group despite the fan-out.
 */
export interface BreakdownExpr {
  readonly expr: string
  readonly isArray: boolean
}

/**
 * Everything stream-specific lives behind one descriptor so the engine stays
 * generic: adding a stream is adding a descriptor under `streams/`, with no stream
 * `if` branches in the aggregate or query builders. Streams that share a column
 * shape (the trace family) share an aggregate builder; streams with a different
 * shape (scores, moments, …) bring their own.
 */
export interface StreamDescriptor {
  buildInner(input: MetricSqlInput): Effect.Effect<InnerQuery, RepositoryError, ChSqlClient>
  /** SQL aggregate for the metric, over the inner subquery's columns. */
  aggregate(metric: MonitorMetric): string
  /** Breakdown dimensions this stream exposes (logical field → SQL expression). */
  readonly breakdowns: Record<string, BreakdownExpr>
  /** The inner column to bucket on for time series. */
  readonly timeColumn: string
}
