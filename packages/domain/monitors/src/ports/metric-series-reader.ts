import { type SeriesReaderShape, seasonalAnomalyThreshold } from "@domain/incidents"
import type {
  ChSqlClient,
  FilterSet,
  MetricTimeAxis,
  MonitorMetric,
  MonitorStream,
  OrganizationId,
  ProjectId,
  RepositoryError,
  ValidationError,
} from "@domain/shared"
import { SEASONAL_HISTORY_WEEKS } from "@domain/signals"
import { Context, Effect } from "effect"

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
  /** Which timestamp every window on this target measures against. Required, not defaulted: the wrong axis under-reports silently. */
  readonly timeAxis: MetricTimeAxis
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
  valueInWindow(input: MetricSeriesWindowInput): Effect.Effect<number, RepositoryError | ValidationError, ChSqlClient>
  /** Earliest matching-row time in `[from, to)` on the target's axis, or `null` when none match. Backs the incident's backtraced `started_at`. */
  firstEventAt(
    input: MetricSeriesWindowInput,
  ): Effect.Effect<Date | null, RepositoryError | ValidationError, ChSqlClient>
  /** Latest matching-row time in `[from, to)` on the target's axis, or `null` when none match. Backs the sustained incident's backtraced `ended_at`. */
  lastEventAt(
    input: MetricSeriesWindowInput,
  ): Effect.Effect<Date | null, RepositoryError | ValidationError, ChSqlClient>
  /**
   * Per-bucket metric over `[from, to)`, tiled into `N = floor((to - from) / bucketMs)`
   * fixed-width buckets aligned to `to`. Returns exactly `N` values, **newest-first**
   * (index `0` = the bucket ending at `to`), zero-filled for empty buckets. Backs the
   * `metric.escalating` sustained-gate and prompt close.
   */
  seriesPerBucket(
    input: MetricSeriesBucketInput,
  ): Effect.Effect<readonly number[], RepositoryError | ValidationError, ChSqlClient>
}

export class MetricSeriesReader extends Context.Service<MetricSeriesReader, MetricSeriesReaderShape>()(
  "@domain/monitors/MetricSeriesReader",
) {}

export interface MetricSeriesReaderAdapterInput {
  readonly resolveTarget: (sourceId: string) => MetricSeriesTarget
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length

const stddev = (values: readonly number[]): number => {
  if (values.length === 0) return 0
  const avg = mean(values)
  return Math.sqrt(values.reduce((total, value) => total + (value - avg) ** 2, 0) / values.length)
}

const historicalWindows = (from: Date, to: Date) =>
  Array.from({ length: SEASONAL_HISTORY_WEEKS }, (_, index) => {
    const shift = (index + 1) * WEEK_MS
    return {
      from: new Date(from.getTime() - shift),
      to: new Date(to.getTime() - shift),
    }
  })

const historicalValues = (
  reader: MetricSeriesReaderShape,
  input: Omit<MetricSeriesWindowInput, "from" | "to"> & { readonly from: Date; readonly to: Date },
) =>
  Effect.all(
    historicalWindows(input.from, input.to).map((window) =>
      reader.valueInWindow({ ...input, from: window.from, to: window.to }),
    ),
    { concurrency: "unbounded" },
  )

export const makeMetricSeriesReaderSeriesReader = (
  reader: MetricSeriesReaderShape,
  adapter: MetricSeriesReaderAdapterInput,
): SeriesReaderShape => ({
  readSeasonalSeries: (input) =>
    Effect.gen(function* () {
      const target = adapter.resolveTarget(input.sourceId)
      const from1h = new Date(input.now.getTime() - 60 * 60 * 1000)
      const from6h = new Date(input.now.getTime() - 6 * 60 * 60 * 1000)
      const from24h = new Date(input.now.getTime() - 24 * 60 * 60 * 1000)
      const [recent1h, recent6h, recent24h] = yield* Effect.all(
        [
          reader.valueInWindow({
            organizationId: input.organizationId,
            projectId: input.projectId,
            target,
            from: from1h,
            to: input.now,
          }),
          reader.valueInWindow({
            organizationId: input.organizationId,
            projectId: input.projectId,
            target,
            from: from6h,
            to: input.now,
          }),
          reader.valueInWindow({
            organizationId: input.organizationId,
            projectId: input.projectId,
            target,
            from: from24h,
            to: input.now,
          }),
        ],
        { concurrency: "unbounded" },
      )
      const [history1h, history6h] = yield* Effect.all(
        [
          historicalValues(reader, {
            organizationId: input.organizationId,
            projectId: input.projectId,
            target,
            from: from1h,
            to: input.now,
          }),
          historicalValues(reader, {
            organizationId: input.organizationId,
            projectId: input.projectId,
            target,
            from: from6h,
            to: input.now,
          }),
        ],
        { concurrency: "unbounded" },
      )
      const history6hPerHour = history6h.map((value) => value / 6)
      return {
        recent1h,
        recent6h,
        recent24h,
        expected1h: mean(history1h),
        expected6hPerHour: mean(history6hPerHour),
        stddev1h: stddev(history1h),
        stddev6hPerHour: stddev(history6hPerHour),
        samplesCount: history1h.length,
      }
    }),
  readCrossingBuckets: (input) =>
    Effect.gen(function* () {
      const target = adapter.resolveTarget(input.sourceId)
      const values = yield* reader.seriesPerBucket({
        organizationId: input.organizationId,
        projectId: input.projectId,
        target,
        from: input.from,
        to: input.to,
        bucketMs: input.bucketSeconds * 1000,
      })
      const bucketMs = input.bucketSeconds * 1000
      const thresholds = yield* Effect.all(
        values.map((_, index) => {
          const bucketEnd = new Date(input.to.getTime() - index * bucketMs)
          const bucketStart = new Date(bucketEnd.getTime() - bucketMs)
          return historicalValues(reader, {
            organizationId: input.organizationId,
            projectId: input.projectId,
            target,
            from: bucketStart,
            to: bucketEnd,
          }).pipe(
            Effect.map((history) => ({
              bucket: bucketStart.toISOString(),
              thresholdCount: seasonalAnomalyThreshold(mean(history), stddev(history), input.kShort),
            })),
          )
        }),
        { concurrency: "unbounded" },
      )
      return {
        counts: values.map((count, index) => ({
          bucket: new Date(input.to.getTime() - (index + 1) * bucketMs).toISOString(),
          count,
        })),
        thresholds,
      }
    }),
})
