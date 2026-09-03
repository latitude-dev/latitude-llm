import type {
  AnalyticsStream,
  BehaviorMetric,
  ChSqlClient,
  FilterSet,
  MomentMetric,
  MonitorMetric,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ScoreMetric,
  ValidationError,
} from "@domain/shared"
import type { Effect } from "effect"

/**
 * Which end of an entity's lifespan the `[from, to)` window filters on. Monitors
 * window on `"end"` (an entity qualifies when its latest activity lands in the
 * window, so a long run is still visible when it finishes); analytics,
 * experiments and the dashboards window on `"start"`.
 */
export type WindowAnchor = "start" | "end"

/** The metric vocabulary a given stream accepts — each non-trace stream has its own; the rest are trace-family. */
export type MetricForStream<S extends AnalyticsStream> = S extends "scores"
  ? ScoreMetric
  : S extends "behaviors"
    ? BehaviorMetric
    : S extends "moments"
      ? MomentMetric
      : MonitorMetric

/**
 * The window input the SQL builders need: a predicate (+ optional semantic
 * query) and the metric to compute. Generic over the stream so `metric` is
 * exactly the vocabulary that stream accepts — invalid stream+metric pairings
 * don't compile. There is deliberately no `stream` field: the caller has already
 * resolved the descriptor via `streamFor(...)`, so the descriptor *is* the
 * stream. The monitor firing path (`MetricSeriesWindowInput`) and the analytics
 * query both unbundle their own shape into this on the way in.
 */
export interface MetricSqlInput<S extends AnalyticsStream = AnalyticsStream> {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly filterSet: FilterSet
  /** Semantic search query — `traces`/`sessions` only; `null` otherwise. */
  readonly query: string | null
  readonly metric: MetricForStream<S>
  /**
   * The requested breakdown field, if any. Lets a stream's `buildInner` prune
   * work it doesn't need for this breakdown — e.g. `scores` skips the traces
   * join unless the breakdown is a trace dimension. The engine still applies
   * the actual `GROUP BY` itself.
   */
  readonly breakdown?: string
  /** Inclusive lower bound on the row's time axis. */
  readonly from: Date
  /** Exclusive upper bound. */
  readonly to: Date
  /** The time axis the window filters on. Defaults to `"start"`; only the monitor firing path passes `"end"`. */
  readonly windowAnchor?: WindowAnchor
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
  buildInner(input: MetricSqlInput<S>): Effect.Effect<InnerQuery, RepositoryError | ValidationError, ChSqlClient>
  /** SQL aggregate over the inner subquery's columns, for the metric this stream accepts. */
  aggregate(metric: MetricForStream<S>): string
  /** Breakdown dimensions this stream exposes (logical field → SQL expression). */
  readonly breakdowns: Record<string, BreakdownExpr>
  /**
   * The inner columns to window and bucket on, per anchor. `end` is absent on
   * streams whose rows are a point in time rather than a lifespan (a score, a
   * behavior observation, a moment) — those are unreachable from monitors, so
   * they never see a non-default anchor.
   */
  readonly timeColumns: { readonly start: string; readonly end?: string }
  /**
   * The inner expression identifying the entity a row belongs to, at the same
   * grain as {@link aggregate}'s `count` dedup. Monitors read it to alert once
   * per matching run; only the monitor streams need it.
   */
  readonly entityIdExpr?: string
}
