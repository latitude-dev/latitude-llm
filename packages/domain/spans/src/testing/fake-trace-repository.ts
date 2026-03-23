import { Effect } from "effect"
import type { TraceRepositoryShape } from "../ports/trace-repository.ts"

export const createFakeTraceRepository = (overrides?: Partial<TraceRepositoryShape>) => {
  const repository: TraceRepositoryShape = {
    findByProjectId: () => Effect.succeed({ items: [], hasMore: false }),
    countByProjectId: () => Effect.succeed(0),
    findByTraceId: () => Effect.succeed(null),
    findByTraceIds: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository }
}
