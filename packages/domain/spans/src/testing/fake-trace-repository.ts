import { Effect } from "effect"
import type { TraceRepositoryShape } from "../ports/trace-repository.ts"

export const createFakeTraceRepository = (overrides?: Partial<TraceRepositoryShape>) => {
  const listByProjectId =
    overrides?.listByProjectId ?? overrides?.findByProjectId ?? (() => Effect.succeed({ items: [], hasMore: false }))
  const findByProjectId = overrides?.findByProjectId ?? overrides?.listByProjectId ?? listByProjectId

  const listByTraceIds = overrides?.listByTraceIds ?? overrides?.findByTraceIds ?? (() => Effect.succeed([]))
  const findByTraceIds = overrides?.findByTraceIds ?? overrides?.listByTraceIds ?? listByTraceIds

  const repository: TraceRepositoryShape = {
    listByProjectId,
    findByProjectId,
    countByProjectId: () => Effect.succeed(0),
    aggregateMetricsByProjectId: () => Effect.succeed(null),
    histogramByProjectId: () => Effect.succeed([]),
    findByTraceId: () => Effect.succeed(null),
    listByTraceIds,
    findByTraceIds,
    distinctFilterValues: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository }
}
