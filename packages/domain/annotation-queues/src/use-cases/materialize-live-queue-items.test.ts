import { OrganizationId, ProjectId, SqlClient, type SqlClientShape, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  AnnotationQueueItemRepository,
  type AnnotationQueueItemRepositoryShape,
} from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository, type AnnotationQueueRepositoryShape } from "../ports/annotation-queue-repository.ts"
import { createFakeAnnotationQueueItemRepository } from "../testing/fake-annotation-queue-item-repository.ts"
import { createFakeAnnotationQueueRepository } from "../testing/fake-annotation-queue-repository.ts"
import { materializeLiveQueueItemsUseCase } from "./materialize-live-queue-items.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")
const TRACE_ID = TraceId("tttttttttttttttttttttttttttttttt")
const TRACE_CREATED_AT = new Date("2025-04-01T10:00:00.000Z")

describe("materializeLiveQueueItemsUseCase", () => {
  it("returns insertedItemCount 0 without calling transaction or repositories when queueIds is empty", async () => {
    let transactionCalled = false
    let insertCalled = false
    let incrementCalled = false

    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository({
      insertManyAcrossQueues: () => {
        insertCalled = true
        return Effect.succeed({ insertedQueueIds: [] })
      },
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository({
      incrementTotalItemsMany: () => {
        incrementCalled = true
        return Effect.void
      },
    })

    const sqlClient: SqlClientShape = {
      organizationId: ORG_ID,
      transaction: () => {
        transactionCalled = true
        return Effect.die(new Error("transaction should not run for empty queueIds"))
      },
      query: () => Effect.die(new Error("query should not run")),
    }

    const result = await Effect.runPromise(
      materializeLiveQueueItemsUseCase({
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        traceCreatedAt: TRACE_CREATED_AT,
        queueIds: [],
      }).pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
      ),
    )

    expect(result).toEqual({ insertedItemCount: 0 })
    expect(transactionCalled).toBe(false)
    expect(insertCalled).toBe(false)
    expect(incrementCalled).toBe(false)
  })

  it("inserts across queues then increments totals for insertedQueueIds and returns that count", async () => {
    const queueA = "qqqqqqqqqqqqqqqqqqqqqqqq"
    const queueB = "rrrrrrrrrrrrrrrrrrrrrrrr"
    const returnedInsertedIds = [queueA, queueB]

    const steps: string[] = []
    let capturedInsert: Parameters<AnnotationQueueItemRepositoryShape["insertManyAcrossQueues"]>[0] | null = null
    let capturedIncrement: Parameters<AnnotationQueueRepositoryShape["incrementTotalItemsMany"]>[0] | null = null

    const { repository: itemRepo } = createFakeAnnotationQueueItemRepository({
      insertManyAcrossQueues: (input) => {
        steps.push("insert")
        capturedInsert = input
        return Effect.succeed({ insertedQueueIds: returnedInsertedIds })
      },
    })
    const { repository: queueRepo } = createFakeAnnotationQueueRepository({
      incrementTotalItemsMany: (input) => {
        steps.push("increment")
        capturedIncrement = input
        return Effect.void
      },
    })

    const fakeSqlClient: SqlClientShape = {
      organizationId: ORG_ID,
      transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
      query: () => Effect.die(new Error("unexpected query")),
    }

    const result = await Effect.runPromise(
      materializeLiveQueueItemsUseCase({
        projectId: PROJECT_ID,
        traceId: TRACE_ID,
        traceCreatedAt: TRACE_CREATED_AT,
        queueIds: [queueA, queueB, "ssssssssssssssssssssssss"],
      }).pipe(
        Effect.provideService(SqlClient, fakeSqlClient),
        Effect.provideService(AnnotationQueueItemRepository, itemRepo),
        Effect.provideService(AnnotationQueueRepository, queueRepo),
      ),
    )

    expect(result.insertedItemCount).toBe(2)
    expect(steps).toEqual(["insert", "increment"])
    expect(capturedInsert).toEqual({
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
      traceCreatedAt: TRACE_CREATED_AT,
      queueIds: [queueA, queueB, "ssssssssssssssssssssssss"],
    })
    expect(capturedIncrement).toEqual({
      projectId: PROJECT_ID,
      queueIds: returnedInsertedIds,
    })
  })
})
