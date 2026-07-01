import type {
  AnalyticsMetric,
  AnalyticsSeriesPoint,
  AnalyticsStream,
  AnalyticsTimeBucket,
  ChSqlClient,
  FilterSet,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * A resolved analytics query: a metric over a filtered stream, optionally broken
 * down by a dimension and/or bucketed over time. `breakdown` is a *logical* field
 * name already validated against the stream's allowed set (`@domain/shared`); the
 * adapter maps it to a ClickHouse column expression and rejects unknown fields.
 */
export interface AnalyticsQueryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly stream: AnalyticsStream
  readonly filterSet: FilterSet
  /** Semantic search — `traces`/`sessions` only; `null` otherwise. */
  readonly query: string | null
  readonly metric: AnalyticsMetric
  readonly breakdown?: string
  readonly timeBucket?: AnalyticsTimeBucket
  /** Inclusive lower bound on the row's time axis. */
  readonly from: Date
  /** Exclusive upper bound. */
  readonly to: Date
  readonly orderBy: { readonly by: "value" | "key"; readonly direction: "asc" | "desc" }
  readonly limit: number
}

export interface AnalyticsQueryReaderShape {
  /**
   * Run the query and return one tidy series. Each point carries the breakdown
   * `key` (when `breakdown` is set) and/or the bucket start (when `timeBucket` is
   * set); a metric-only query returns a single point. Org/project scoping, filter
   * compilation, and wire-scale conversions are inherited from the field registries.
   */
  query(input: AnalyticsQueryInput): Effect.Effect<readonly AnalyticsSeriesPoint[], RepositoryError, ChSqlClient>
}

export class AnalyticsQueryReader extends Context.Service<AnalyticsQueryReader, AnalyticsQueryReaderShape>()(
  "@domain/spans/AnalyticsQueryReader",
) {}
