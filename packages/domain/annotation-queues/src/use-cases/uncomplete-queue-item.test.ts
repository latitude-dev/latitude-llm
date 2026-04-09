import {
  AnnotationQueueId,
  AnnotationQueueItemId,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
  TraceId,
} from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { AnnotationQueueItem } from "../entities/annotation-queue-items.ts"
import { QueueItemNotCompletedError, QueueItemNotFoundError } from "../errors.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueItemRepository } from "../testing/fake-annotation-queue-item-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { uncompleteQueueItemUseCase } from "./uncomplete-queue-item.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")
const QUEUE_ID = AnnotationQueueId("qqqqqqqqqqqqqqqqqqqqqqqq")
const ITEM_ID = AnnotationQueueItemId("iiiiiiiiiiiiiiiiiiiiiiii")
const USER_ID = "uuuuuuuuuuuuuuuuuuuuuuuu"

const createPassthroughSqlClient = (): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: ORG_ID,
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const makeQueue = (overrides?: Partial<AnnotationQueue>): AnnotationQueue => ({
  id: QUEUE_ID,
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  system: false,
  name: "Test Queue",
  slug: "test-queue",
  description: "",
  instructions: "",
  settings: {},
  assignees: [],
  totalItems: 2,
  completedItems: 1,
  deletedAt: null,
  createdAt: new Date("2025-04-01T10:00:00.000Z"),
  updatedAt: new Date("2025-04-01T10:00:00.000Z"),
  ...overrides,
})

const makeItem = (overrides?: Partial<AnnotationQueueItem>): AnnotationQueueItem => ({
  id: ITEM_ID,
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  queueId: QUEUE_ID,
  traceId: TraceId("tttttttttttttttttttttttttttttttt"),
  traceCreatedAt: new Date("2025-04-01T10:00:00.000Z"),
  completedAt: new Date("2025-04-02T00:00:00.000Z"),
  completedBy: USER_ID,
  reviewStartedAt: null,
  createdAt: new Date("2025-04-01T10:00:00.000Z"),
  updatedAt: new Date("2025-04-01T10:00:00.000Z"),
  ...overrides,
})

describe("uncompleteQueueItemUseCase", () => {
  it("uncompletes a completed item successfully", async () => {
    const item = makeItem()
    const queue = makeQueue()
    const { repository: itemRepo, items } = createFakeAnnotationQueueItemRepository([item])
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])

    const result = await Effect.runPromise(
      uncompleteQueueItemUseCase({
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        itemId: item.id,
      }).pipe(
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(result.completedAt).toBeNull()
    expect(result.completedBy).toBeNull()
    expect(items.get(item.id)?.completedAt).toBeNull()
  })

  it("decrements the queue's completedItems counter", async () => {
    const item = makeItem()
    const queue = makeQueue({ completedItems: 5 })
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository([item])
    const { repository: queueRepo, queues } = createFakeAnnotationQueueRepository([queue])

    await Effect.runPromise(
      uncompleteQueueItemUseCase({
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        itemId: item.id,
      }).pipe(
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
      ),
    )

    expect(queues.get(QUEUE_ID)?.completedItems).toBe(4)
  })

  it("fails with QueueItemNotFoundError when item does not exist", async () => {
    const queue = makeQueue()
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository([])
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])

    const err = await Effect.runPromise(
      Effect.match(
        uncompleteQueueItemUseCase({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          itemId: "nonexistent",
        }).pipe(
          Effect.provideService(AnnotationQueueItemRepository, itemRepo),
          Effect.provideService(AnnotationQueueRepository, queueRepo),
          Effect.provideService(SqlClient, createPassthroughSqlClient()),
        ),
        {
          onFailure: (e) => e,
          onSuccess: () => {
            throw new Error("expected failure")
          },
        },
      ),
    )

    expect(err).toBeInstanceOf(QueueItemNotFoundError)
  })

  it("fails with QueueItemNotCompletedError when item is not completed", async () => {
    const item = makeItem({
      completedAt: null,
      completedBy: null,
    })
    const queue = makeQueue()
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository([item])
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])

    const err = await Effect.runPromise(
      Effect.match(
        uncompleteQueueItemUseCase({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          itemId: item.id,
        }).pipe(
          Effect.provideService(AnnotationQueueItemRepository, itemRepo),
          Effect.provideService(AnnotationQueueRepository, queueRepo),
          Effect.provideService(SqlClient, createPassthroughSqlClient()),
        ),
        {
          onFailure: (e) => e,
          onSuccess: () => {
            throw new Error("expected failure")
          },
        },
      ),
    )

    expect(err).toBeInstanceOf(QueueItemNotCompletedError)
  })
})
