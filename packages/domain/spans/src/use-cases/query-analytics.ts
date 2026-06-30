import type {
  AnalyticsQuery,
  AnalyticsSeriesPoint,
  ChSqlClient,
  OrganizationId,
  ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import { AnalyticsQueryReader } from "../ports/analytics-query-reader.ts"

export interface QueryAnalyticsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** A validated analytics query (see `analyticsQuerySchema` in `@domain/shared`). */
  readonly query: AnalyticsQuery
}

/**
 * Run one composable analytics query (metric × optional breakdown × optional time
 * bucket over a filtered stream) and return its tidy series. Resolution of the
 * stream's SQL, tenancy scoping, and wire-scale conversions live in the reader.
 */
export const queryAnalyticsUseCase = (
  input: QueryAnalyticsInput,
): Effect.Effect<readonly AnalyticsSeriesPoint[], RepositoryError, AnalyticsQueryReader | ChSqlClient> =>
  Effect.gen(function* () {
    const reader = yield* AnalyticsQueryReader
    const q = input.query
    const breakdown = q.breakdown
    const query = q.stream === "spans" ? null : (q.query ?? null)
    return yield* reader.query({
      organizationId: input.organizationId,
      projectId: input.projectId,
      stream: q.stream,
      filterSet: q.filters ?? {},
      query,
      metric: q.metric,
      ...(breakdown !== undefined ? { breakdown } : {}),
      ...(q.timeBucket ? { timeBucket: q.timeBucket } : {}),
      from: new Date(q.range.fromIso),
      to: new Date(q.range.toIso),
      orderBy: q.orderBy,
      limit: q.limit,
    })
  })
