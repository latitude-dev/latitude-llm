import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { SessionRepositoryShape } from "../ports/session-repository.ts"
import { emptySessionMetrics } from "../ports/session-repository.ts"
import { emptyTraceDistribution } from "../ports/trace-repository.ts"

export const createFakeSessionRepository = (overrides?: Partial<SessionRepositoryShape>) => {
  const repository: SessionRepositoryShape = {
    listByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed({ totalCount: 0 }),
    aggregateMetricsByProjectId: () => Effect.succeed(emptySessionMetrics()),
    findBySessionId: ({ sessionId }) => Effect.fail(new NotFoundError({ entity: "Session", id: sessionId as string })),
    distinctFilterValues: () => Effect.succeed([]),
    getDistribution: () => Effect.succeed(emptyTraceDistribution()),
    ...overrides,
  }

  return { repository }
}
