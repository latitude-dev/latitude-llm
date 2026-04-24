import { OutboxEventWriter } from "@domain/events"
import {
  AnnotationQueueId,
  AnnotationQueueItemId,
  ChSqlClient,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
  TraceId,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { AnnotationQueue } from "../entities/annotation-queue.ts"
import type { AnnotationQueueItem } from "../entities/annotation-queue-items.ts"
import { QueueItemAlreadyCompletedError, QueueItemNotFoundError } from "../errors.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueItemRepository } from "../testing/fake-annotation-queue-item-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { completeQueueItemUseCase } from "./complete-queue-item.ts"

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
  completedItems: 0,
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
  completedAt: null,
  completedBy: null,
  reviewStartedAt: null,
  createdAt: new Date("2025-04-01T10:00:00.000Z"),
  updatedAt: new Date("2025-04-01T10:00:00.000Z"),
  ...overrides,
})

describe("completeQueueItemUseCase", () => {
  it("completes a pending item successfully", async () => {
    const item = makeItem()
    const queue = makeQueue()
    const { repository: itemRepo, items } = createFakeAnnotationQueueItemRepository([item])
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])

    const result = await Effect.runPromise(
      completeQueueItemUseCase({
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        itemId: item.id,
        userId: USER_ID,
      }).pipe(
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: ORG_ID })),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
      ),
    )

    expect(result.completedAt).not.toBeNull()
    expect(result.completedBy).toBe(USER_ID)
    expect(items.get(item.id)?.completedAt).not.toBeNull()
  })

  it("increments the queue's completedItems counter", async () => {
    const item = makeItem()
    const queue = makeQueue({ completedItems: 5 })
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository([item])
    const { repository: queueRepo, queues } = createFakeAnnotationQueueRepository([queue])

    await Effect.runPromise(
      completeQueueItemUseCase({
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        itemId: item.id,
        userId: USER_ID,
      }).pipe(
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
        Effect.provideService(SqlClient, createPassthroughSqlClient()),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: ORG_ID })),
        Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
      ),
    )

    expect(queues.get(QUEUE_ID)?.completedItems).toBe(6)
  })

  it("fails with QueueItemNotFoundError when item does not exist", async () => {
    const queue = makeQueue()
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository([])
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])

    const err = await Effect.runPromise(
      Effect.match(
        completeQueueItemUseCase({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          itemId: "nonexistent",
          userId: USER_ID,
        }).pipe(
          Effect.provideService(AnnotationQueueItemRepository, itemRepo),
          Effect.provideService(AnnotationQueueRepository, queueRepo),
          Effect.provideService(SqlClient, createPassthroughSqlClient()),
          Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
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

  it("fails with QueueItemAlreadyCompletedError when item already completed", async () => {
    const item = makeItem({
      completedAt: new Date("2025-04-02T00:00:00.000Z"),
      completedBy: USER_ID,
    })
    const queue = makeQueue()
    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository([item])
    const { repository: queueRepo } = createFakeAnnotationQueueRepository([queue])

    const err = await Effect.runPromise(
      Effect.match(
        completeQueueItemUseCase({
          projectId: PROJECT_ID,
          queueId: QUEUE_ID,
          itemId: item.id,
          userId: USER_ID,
        }).pipe(
          Effect.provideService(AnnotationQueueItemRepository, itemRepo),
          Effect.provideService(AnnotationQueueRepository, queueRepo),
          Effect.provideService(SqlClient, createPassthroughSqlClient()),
          Effect.provideService(OutboxEventWriter, { write: () => Effect.void }),
        ),
        {
          onFailure: (e) => e,
          onSuccess: () => {
            throw new Error("expected failure")
          },
        },
      ),
    )

    expect(err).toBeInstanceOf(QueueItemAlreadyCompletedError)
  })
})
