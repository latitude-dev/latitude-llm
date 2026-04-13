import { AnnotationQueueId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { AnnotationQueueRepositoryShape } from "../ports/annotation-queue-repository.ts"

export const createFakeAnnotationQueueRepository = (
  overrides?: Partial<AnnotationQueueRepositoryShape>,
): { repository: AnnotationQueueRepositoryShape; getLastSavedQueue: () => AnnotationQueue | undefined } => {
  let lastSavedQueue: AnnotationQueue | undefined

  const repository: AnnotationQueueRepositoryShape = {
    listByProject: () => Effect.succeed({ items: [], hasMore: false }),
    findByIdInProject: () => Effect.succeed(null),
    findBySlugInProject: () => Effect.succeed(null),
    listSystemQueuesByProject: () => Effect.succeed([]),
    findSystemQueueBySlugInProject: () => Effect.succeed(null),
    save: (queue) =>
      Effect.sync(() => {
        lastSavedQueue = queue
      }),
    insertIfNotExists: () => Effect.succeed(true),
    incrementTotalItems: ({ queueId, delta = 1 }) =>
      Effect.succeed({
        id: AnnotationQueueId(queueId),
        organizationId: OrganizationId("fake-org".padEnd(24, "0")),
        projectId: ProjectId("fake-project".padEnd(24, "0")),
        system: false,
        name: "Fake Queue",
        slug: "fake-queue",
        description: "",
        instructions: "",
        settings: {},
        assignees: [],
        totalItems: delta,
        completedItems: 0,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ...overrides,
  }

  return { repository, getLastSavedQueue: () => lastSavedQueue }
}
