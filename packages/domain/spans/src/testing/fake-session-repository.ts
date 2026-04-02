import { Effect } from "effect"
import type { SessionRepositoryShape } from "../ports/session-repository.ts"

export const createFakeSessionRepository = (overrides?: Partial<SessionRepositoryShape>) => {
  const listByProjectId =
    overrides?.listByProjectId ?? overrides?.findByProjectId ?? (() => Effect.succeed({ items: [], hasMore: false }))
  const findByProjectId = overrides?.findByProjectId ?? overrides?.listByProjectId ?? listByProjectId

  const repository: SessionRepositoryShape = {
    listByProjectId,
    findByProjectId,
    countByProjectId: () => Effect.succeed(0),
    aggregateMetricsByProjectId: () => Effect.succeed(null),
    distinctFilterValues: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository }
}
