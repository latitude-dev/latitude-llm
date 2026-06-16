import type {
  ChSqlClient,
  FilterSet,
  MonitorMetric,
  MonitorStream,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * A resolved query-time monitor target: the stream + predicate (+ optional
 * semantic query) and the metric to compute over the matched rows. Saved
 * searches resolve to `{stream:'traces', filterSet, query}`; tool/user/raw
 * targets are inline FilterSet presets. Generalises `SavedSearchMatchTarget`.
 */
export interface MetricSeriesTarget {
  readonly stream: MonitorStream
  readonly filterSet: FilterSet
  /** Semantic search query — `traces` stream only; `null` otherwise. */
  readonly query: string | null
  readonly metric: MonitorMetric
}

export interface MetricSeriesWindowInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly target: MetricSeriesTarget
  /** Inclusive lower bound on the row's time axis. */
  readonly from: Date
  /** Exclusive upper bound — the evaluation `now`. */
  readonly to: Date
}

export interface MetricSeriesBucketInput extends MetricSeriesWindowInput {
  /** Bucket width. `[from, to)` is tiled into `floor((to - from) / bucketMs)` buckets aligned to `to`. */
  readonly bucketMs: number
}

/**
 * The metric value of a target over a window + per-bucket, plus the first/last
 * matching-event times for incident backtracking. A dedicated port (not a trace
 * port widening) keeps the firing concern off the broadly-stubbed trace port.
 * For `metric.kind === 'count'` this is exactly the saved-search match reader it supersedes.
 */
export interface MetricSeriesReaderShape {
  /** The metric over rows whose time axis falls in `[from, to)`. */
  valueInWindow(input: MetricSeriesWindowInput): Effect.Effect<number, RepositoryError, ChSqlClient>
  /** Earliest matching-row time in `[from, to)`, or `null` when none match. Backs the incident's backtraced `started_at`. */
  firstEventAt(input: MetricSeriesWindowInput): Effect.Effect<Date | null, RepositoryError, ChSqlClient>
  /** Latest matching-row time in `[from, to)`, or `null` when none match. Backs the sustained incident's backtraced `ended_at`. */
  lastEventAt(input: MetricSeriesWindowInput): Effect.Effect<Date | null, RepositoryError, ChSqlClient>
  /**
   * Per-bucket metric over `[from, to)`, tiled into `N = floor((to - from) / bucketMs)`
   * fixed-width buckets aligned to `to`. Returns exactly `N` values, **newest-first**
   * (index `0` = the bucket ending at `to`), zero-filled for empty buckets. Backs the
   * `metric.escalating` sustained-gate and prompt close.
   */
  seriesPerBucket(input: MetricSeriesBucketInput): Effect.Effect<readonly number[], RepositoryError, ChSqlClient>
}

export class MetricSeriesReader extends Context.Service<MetricSeriesReader, MetricSeriesReaderShape>()(
  "@domain/monitors/MetricSeriesReader",
) {}
