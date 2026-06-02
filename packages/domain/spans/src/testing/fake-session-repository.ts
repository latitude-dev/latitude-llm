import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { SessionRepositoryShape } from "../ports/session-repository.ts"
import { emptySessionMetrics } from "../ports/session-repository.ts"
import { emptyTraceDistribution } from "../ports/trace-repository.ts"

export const createFakeSessionRepository = (overrides?: Partial<SessionRepositoryShape>) => {
  const repository: SessionRepositoryShape = {
    getCohortBaseline: () =>
      Effect.succeed({
        count: 0,
        metrics: {
          durationNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          costTotalMicrocents: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          tokensTotal: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
          timeToFirstTokenNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
        },
      }),
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed({ totalCount: 0 }),
    aggregateMetricsByProjectId: () => Effect.succeed(emptySessionMetrics()),
    histogramByProjectId: () => Effect.succeed([]),
    findBySessionId: ({ sessionId }) => Effect.fail(new NotFoundError({ entity: "Session", id: sessionId as string })),
    distinctFilterValues: () => Effect.succeed([]),
    getDistribution: () => Effect.succeed(emptyTraceDistribution()),
    ...overrides,
  }

  return { repository }
}
