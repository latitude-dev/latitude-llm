import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import { emptyTraceMetrics, type TraceRepositoryShape } from "../ports/trace-repository.ts"

export const createFakeTraceRepository = (overrides?: Partial<TraceRepositoryShape>) => {
  const repository: TraceRepositoryShape = {
    getCohortBaselineByTags: () =>
      Effect.succeed({
        traceCount: 0,
        metrics: {
          durationNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          costTotalMicrocents: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          tokensTotal: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          timeToFirstTokenNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
        },
      }),
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed(0),
    aggregateMetricsByProjectId: () => Effect.succeed(emptyTraceMetrics()),
    histogramByProjectId: () => Effect.succeed([]),
    findByTraceId: () => Effect.fail(new NotFoundError({ entity: "Trace", id: "" })),
    matchesFiltersByTraceId: () => Effect.succeed(false),
    listMatchingFilterIdsByTraceId: () => Effect.succeed([]),
    listByTraceIds: () => Effect.succeed([]),
    distinctFilterValues: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository }
}
