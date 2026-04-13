import { Effect } from "effect"
import type { AnnotationQueueItemRepositoryShape } from "../ports/annotation-queue-item-repository.ts"

export const createFakeAnnotationQueueItemRepository = (
  overrides?: Partial<AnnotationQueueItemRepositoryShape>,
): AnnotationQueueItemRepositoryShape => ({
  listByQueue: () => Effect.succeed({ items: [], hasMore: false }),
  findById: () => Effect.succeed(null),
  insertIfNotExists: () => Effect.succeed(true),
  bulkInsertIfNotExists: ({ items }) => Effect.succeed({ insertedCount: items.length }),
  ...overrides,
})
