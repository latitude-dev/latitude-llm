import { Effect } from "effect"
import type { TraceRepositoryShape } from "../ports/trace-repository.ts"

export const createFakeTraceRepository = (overrides?: Partial<TraceRepositoryShape>) => {
  const repository: TraceRepositoryShape = {
    findByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed(0),
    aggregateMetricsByProjectId: () => Effect.succeed(null),
    histogramByProjectId: () => Effect.succeed([]),
    findByTraceId: () => Effect.succeed(null),
    findByTraceIds: () => Effect.succeed([]),
    distinctFilterValues: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository }
}
