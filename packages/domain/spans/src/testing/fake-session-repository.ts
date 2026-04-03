import { Effect } from "effect"
import type { SessionRepositoryShape } from "../ports/session-repository.ts"
import { emptySessionMetrics } from "../ports/session-repository.ts"

export const createFakeSessionRepository = (overrides?: Partial<SessionRepositoryShape>) => {
  const repository: SessionRepositoryShape = {
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed(0),
    aggregateMetricsByProjectId: () => Effect.succeed(emptySessionMetrics()),
    distinctFilterValues: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository }
}
