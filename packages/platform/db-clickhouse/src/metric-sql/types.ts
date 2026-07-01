import type {
  AnalyticsStream,
  BehaviorMetric,
  ChSqlClient,
  FilterSet,
  MonitorMetric,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ScoreMetric,
} from "@domain/shared"
import type { Effect } from "effect"

/** The metric vocabulary a given stream accepts — each non-trace stream has its own; the rest are trace-family. */
export type MetricForStream<S extends AnalyticsStream> = S extends "scores"
  ? ScoreMetric
  : S extends "behaviors"
    ? BehaviorMetric
    : MonitorMetric

/**
 * The minimal window input the SQL builders need: a resolved stream + predicate
 * (+ optional semantic query) and the metric to compute. Generic over the stream
 * so `metric` is exactly the vocabulary that stream accepts — invalid stream+metric
 * pairings don't compile. Structurally a subset of `MetricSeriesWindowInput`
 * (monitors) and the analytics-query input; the monitor firing path only ever
 * uses the trace-family streams + `MonitorMetric`.
 */
export interface MetricSqlInput<S extends AnalyticsStream = AnalyticsStream> {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly target: {
    readonly stream: S
    readonly filterSet: FilterSet
    /** Semantic search query — `traces`/`sessions` only; `null` otherwise. */
    readonly query: string | null
    readonly metric: MetricForStream<S>
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
export interface StreamDescriptor<S extends AnalyticsStream = AnalyticsStream> {
  buildInner(input: MetricSqlInput<S>): Effect.Effect<InnerQuery, RepositoryError, ChSqlClient>
  /** SQL aggregate over the inner subquery's columns, for the metric this stream accepts. */
  aggregate(metric: MetricForStream<S>): string
  /** Breakdown dimensions this stream exposes (logical field → SQL expression). */
  readonly breakdowns: Record<string, BreakdownExpr>
  /** The inner column to bucket on for time series. */
  readonly timeColumn: string
}
