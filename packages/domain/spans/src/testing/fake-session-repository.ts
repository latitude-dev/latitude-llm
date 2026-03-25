import { Effect } from "effect"
import type { SessionRepositoryShape } from "../ports/session-repository.ts"

export const createFakeSessionRepository = (overrides?: Partial<SessionRepositoryShape>) => {
  const repository: SessionRepositoryShape = {
    findByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed(0),
    distinctFilterValues: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository }
}
