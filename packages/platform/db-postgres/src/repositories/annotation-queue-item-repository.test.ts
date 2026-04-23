import {
  AnnotationQueueItemRepository,
  AnnotationQueueRepository,
  annotationQueueItemStatusRankFromTimestamps,
} from "@domain/annotation-queues"
import { OrganizationId, ProjectId, RepositoryError, SqlClient, TraceId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { annotationQueueItems, annotationQueues } from "../schema/annotation-queues.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AnnotationQueueItemRepositoryLive } from "./annotation-queue-item-repository.ts"
import { AnnotationQueueRepositoryLive } from "./annotation-queue-repository.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")
const OTHER_PROJECT_ID = ProjectId("qqqqqqqqqqqqqqqqqqqqqqqq")
const QUEUE_ID = "qqqqqqqqqqqqqqqqqqqqqqqq"
const OTHER_QUEUE_ID = "rrrrrrrrrrrrrrrrrrrrrrrr"
const LIMIT = 2

const emptySettings = {} as const

function makeId(prefix: string): string {
  return prefix.padEnd(24, "x").slice(0, 24)
}

function makeTrace(suffix: string): string {
  return suffix.padEnd(32, "0").slice(0, 32)
}

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AnnotationQueueItemRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(AnnotationQueueItemRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const runWithBothLive = <A, E>(
  effect: Effect.Effect<A, E, AnnotationQueueItemRepository | AnnotationQueueRepository | SqlClient>,
) =>
  Effect.runPromise(
    effect.pipe(
      withPostgres(
        Layer.merge(AnnotationQueueItemRepositoryLive, AnnotationQueueRepositoryLive),
        pg.adminPostgresClient,
        ORG_ID,
      ),
    ),
  )

describe("AnnotationQueueItemRepositoryLive", () => {
  beforeAll(async () => {
    const db = pg.db
    const base = new Date("2025-04-01T10:00:00.000Z")
    const older = new Date("2025-04-01T09:00:00.000Z")
    const newer = new Date("2025-04-01T11:00:00.000Z")
    const userId = makeId("uu_user")

    await db.insert(annotationQueues).values([
      {
        id: QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Item test queue",
        slug: "item-test-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      },
      {
        id: OTHER_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: OTHER_PROJECT_ID,
        system: false,
        name: "Other queue",
        slug: "other-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      },
    ])

    await db.insert(annotationQueueItems).values([
      {
        id: makeId("it_done"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        traceId: makeTrace("done"),
        traceCreatedAt: new Date("2025-03-30T10:00:00.000Z"),
        completedAt: new Date("2025-04-02T00:00:00.000Z"),
        completedBy: userId,
        reviewStartedAt: new Date("2025-04-01T15:00:00.000Z"),
        createdAt: newer,
        updatedAt: newer,
      },
      {
        id: makeId("it_prog"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        traceId: makeTrace("prog"),
        traceCreatedAt: new Date("2025-03-30T11:00:00.000Z"),
        completedAt: null,
        completedBy: null,
        reviewStartedAt: new Date("2025-04-01T14:00:00.000Z"),
        createdAt: base,
        updatedAt: base,
      },
      {
        id: makeId("it_pend_old"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        traceId: makeTrace("pend1"),
        // traceCreatedAt is NEWER but createdAt is OLDER - tests that we sort by traceCreatedAt
        traceCreatedAt: new Date("2025-03-30T12:00:00.000Z"),
        completedAt: null,
        completedBy: null,
        reviewStartedAt: null,
        createdAt: older,
        updatedAt: older,
      },
      {
        id: makeId("it_pend_new"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        queueId: QUEUE_ID,
        traceId: makeTrace("pend2"),
        // traceCreatedAt is OLDER but createdAt is NEWER - tests that we sort by traceCreatedAt
        traceCreatedAt: new Date("2025-03-30T09:00:00.000Z"),
        completedAt: null,
        completedBy: null,
        reviewStartedAt: null,
        createdAt: newer,
        updatedAt: newer,
      },
    ])
  })

  describe("listByQueue", () => {
    it("scopes to projectId and queueId", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            options: { limit: 20 },
          })
        }),
      )

      expect(page.items).toHaveLength(4)
      expect(page.items.every((i) => i.queueId === QUEUE_ID)).toBe(true)
      const traces = new Set(page.items.map((i) => i.traceId as string))
      expect(traces).toEqual(new Set([makeTrace("done"), makeTrace("pend1"), makeTrace("pend2"), makeTrace("prog")]))
    })

    it("sorts by status ascending (pending before in-progress before completed)", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            options: { sortBy: "status", sortDirection: "asc", limit: 20 },
          })
        }),
      )

      const ranks = page.items.map((i) => annotationQueueItemStatusRankFromTimestamps(i.completedAt, i.reviewStartedAt))
      expect(ranks).toEqual([0, 0, 1, 2])
      // Within rank 0: traceCreatedAt desc - pend1 has newer traceCreatedAt (12:00) than pend2 (09:00)
      expect(page.items[0].traceId).toEqual(TraceId(makeTrace("pend1")))
      expect(page.items[1].traceId).toEqual(TraceId(makeTrace("pend2")))
      expect(page.items[2].traceId).toEqual(TraceId(makeTrace("prog")))
      expect(page.items[3].traceId).toEqual(TraceId(makeTrace("done")))
    })

    it("paginates by status sort with keyset cursor including statusRank", async () => {
      const first = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            options: { sortBy: "status", sortDirection: "asc", limit: LIMIT },
          })
        }),
      )

      expect(first.items).toHaveLength(2)
      expect(first.hasMore).toBe(true)
      expect(first.nextCursor).toBeDefined()
      expect(first.nextCursor).toMatchObject({
        statusRank: 0,
      })

      const cursor = first.nextCursor
      if (cursor === undefined) throw new Error("expected nextCursor")

      const second = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            options: {
              sortBy: "status",
              sortDirection: "asc",
              limit: LIMIT,
              cursor,
            },
          })
        }),
      )

      expect(second.items).toHaveLength(2)
      expect(second.items[0].traceId).toEqual(TraceId(makeTrace("prog")))
      expect(second.items[1].traceId).toEqual(TraceId(makeTrace("done")))
    })

    it("fails with RepositoryError when createdAt cursor sortValue is invalid", async () => {
      const err = await Effect.runPromise(
        Effect.match(
          Effect.gen(function* () {
            const repo = yield* AnnotationQueueItemRepository
            return yield* repo.listByQueue({
              projectId: PROJECT_ID,
              queueId: QUEUE_ID,
              options: {
                sortBy: "createdAt",
                sortDirection: "desc",
                limit: 5,
                cursor: { sortValue: "invalid-date", id: makeId("it_done") },
              },
            })
          }).pipe(withPostgres(AnnotationQueueItemRepositoryLive, pg.adminPostgresClient, ORG_ID)),
          {
            onFailure: (e) => e,
            onSuccess: () => {
              throw new Error("expected failure")
            },
          },
        ),
      )

      expect(err).toBeInstanceOf(RepositoryError)
      expect(err.operation).toBe("listByQueue")
    })

    it("fails with RepositoryError when status sort cursor omits statusRank", async () => {
      const err = await Effect.runPromise(
        Effect.match(
          Effect.gen(function* () {
            const repo = yield* AnnotationQueueItemRepository
            return yield* repo.listByQueue({
              projectId: PROJECT_ID,
              queueId: QUEUE_ID,
              options: {
                sortBy: "status",
                sortDirection: "asc",
                limit: 5,
                cursor: {
                  sortValue: new Date().toISOString(),
                  id: makeId("it_pend_new"),
                },
              },
            })
          }).pipe(withPostgres(AnnotationQueueItemRepositoryLive, pg.adminPostgresClient, ORG_ID)),
          {
            onFailure: (e) => e,
            onSuccess: () => {
              throw new Error("expected failure")
            },
          },
        ),
      )

      expect(err).toBeInstanceOf(RepositoryError)
      expect(err.operation).toBe("listByQueue")
    })
  })

  describe("findById", () => {
    it("returns the item when found", async () => {
      const item = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.findById({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            itemId: makeId("it_done"),
          })
        }),
      )

      expect(item).not.toBeNull()
      expect(item?.id).toBe(makeId("it_done"))
      expect(item?.traceId).toEqual(TraceId(makeTrace("done")))
    })

    it("returns null when item does not exist", async () => {
      const item = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.findById({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            itemId: makeId("nonexistent"),
          })
        }),
      )

      expect(item).toBeNull()
    })

    it("returns null when item exists in different queue", async () => {
      const item = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.findById({
            projectId: PROJECT_ID,
            queueId: OTHER_QUEUE_ID,
            itemId: makeId("it_done"),
          })
        }),
      )

      expect(item).toBeNull()
    })
  })

  describe("insertIfNotExists", () => {
    it("first insert creates one queue item and returns true", async () => {
      const traceId = TraceId(makeTrace("new_item"))
      const traceCreatedAt = new Date("2025-04-01T10:00:00.000Z")
      const TEST_QUEUE_ID = makeId("insert_test_q1")

      const db = pg.db
      const base = new Date()
      await db.insert(annotationQueues).values({
        id: TEST_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Insert test queue 1",
        slug: "insert-test-queue-1",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const wasInserted = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.insertIfNotExists({
            projectId: PROJECT_ID,
            queueId: TEST_QUEUE_ID,
            traceId,
            traceCreatedAt,
          })
        }),
      )

      expect(wasInserted).toBe(true)

      const item = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          const page = yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: TEST_QUEUE_ID,
            options: { limit: 100 },
          })
          return page.items.find((i) => i.traceId === traceId)
        }),
      )

      expect(item).toBeDefined()
      expect(item?.queueId).toBe(TEST_QUEUE_ID)
      expect(item?.traceId).toBe(traceId)
      expect(item?.completedAt).toBeNull()
      expect(item?.completedBy).toBeNull()
      expect(item?.reviewStartedAt).toBeNull()
    })

    it("duplicate insert is idempotent and returns false", async () => {
      const traceId = TraceId(makeTrace("dup_item"))
      const traceCreatedAt = new Date("2025-04-01T10:00:00.000Z")
      const TEST_QUEUE_ID = makeId("insert_test_q2")

      const db = pg.db
      const base = new Date()
      await db.insert(annotationQueues).values({
        id: TEST_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Insert test queue 2",
        slug: "insert-test-queue-2",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const firstInsert = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.insertIfNotExists({
            projectId: PROJECT_ID,
            queueId: TEST_QUEUE_ID,
            traceId,
            traceCreatedAt,
          })
        }),
      )
      expect(firstInsert).toBe(true)

      const secondInsert = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.insertIfNotExists({
            projectId: PROJECT_ID,
            queueId: TEST_QUEUE_ID,
            traceId,
            traceCreatedAt,
          })
        }),
      )
      expect(secondInsert).toBe(false)

      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: TEST_QUEUE_ID,
            options: { limit: 100 },
          })
        }),
      )

      const matchingItems = page.items.filter((i) => i.traceId === traceId)
      expect(matchingItems).toHaveLength(1)
    })

    it("first insert with counter increment increments totalItems exactly once", async () => {
      const traceId = TraceId(makeTrace("counter_test"))
      const traceCreatedAt = new Date("2025-04-01T10:00:00.000Z")
      const NEW_QUEUE_ID = makeId("counter_queue")

      const db = pg.db
      const base = new Date()
      await db.insert(annotationQueues).values({
        id: NEW_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Counter test queue",
        slug: "counter-test-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const initialQueue = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({
            projectId: PROJECT_ID,
            queueId: NEW_QUEUE_ID,
          })
        }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
      )
      expect(initialQueue?.totalItems).toBe(0)

      const wasInserted = await runWithBothLive(
        Effect.gen(function* () {
          const itemsRepo = yield* AnnotationQueueItemRepository
          const queuesRepo = yield* AnnotationQueueRepository

          const inserted = yield* itemsRepo.insertIfNotExists({
            projectId: PROJECT_ID,
            queueId: NEW_QUEUE_ID,
            traceId,
            traceCreatedAt,
          })

          if (inserted) {
            yield* queuesRepo.incrementTotalItems({
              projectId: PROJECT_ID,
              queueId: NEW_QUEUE_ID,
            })
          }

          return inserted
        }),
      )

      expect(wasInserted).toBe(true)

      const updatedQueue = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({
            projectId: PROJECT_ID,
            queueId: NEW_QUEUE_ID,
          })
        }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
      )
      expect(updatedQueue?.totalItems).toBe(1)
    })

    it("duplicate insert does not double increment counter", async () => {
      const traceId = TraceId(makeTrace("no_double_counter"))
      const traceCreatedAt = new Date("2025-04-01T10:00:00.000Z")
      const NEW_QUEUE_ID = makeId("no_double_queue")

      const db = pg.db
      const base = new Date()
      await db.insert(annotationQueues).values({
        id: NEW_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "No double counter queue",
        slug: "no-double-counter-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const firstInsert = await runWithBothLive(
        Effect.gen(function* () {
          const itemsRepo = yield* AnnotationQueueItemRepository
          const queuesRepo = yield* AnnotationQueueRepository

          const inserted = yield* itemsRepo.insertIfNotExists({
            projectId: PROJECT_ID,
            queueId: NEW_QUEUE_ID,
            traceId,
            traceCreatedAt,
          })

          if (inserted) {
            yield* queuesRepo.incrementTotalItems({
              projectId: PROJECT_ID,
              queueId: NEW_QUEUE_ID,
            })
          }

          return inserted
        }),
      )
      expect(firstInsert).toBe(true)

      const secondInsert = await runWithBothLive(
        Effect.gen(function* () {
          const itemsRepo = yield* AnnotationQueueItemRepository
          const queuesRepo = yield* AnnotationQueueRepository

          const inserted = yield* itemsRepo.insertIfNotExists({
            projectId: PROJECT_ID,
            queueId: NEW_QUEUE_ID,
            traceId,
            traceCreatedAt,
          })

          if (inserted) {
            yield* queuesRepo.incrementTotalItems({
              projectId: PROJECT_ID,
              queueId: NEW_QUEUE_ID,
            })
          }

          return inserted
        }),
      )
      expect(secondInsert).toBe(false)

      const finalQueue = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({
            projectId: PROJECT_ID,
            queueId: NEW_QUEUE_ID,
          })
        }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
      )
      expect(finalQueue?.totalItems).toBe(1)

      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: NEW_QUEUE_ID,
            options: { limit: 100 },
          })
        }),
      )

      const matchingItems = page.items.filter((i) => i.traceId === traceId)
      expect(matchingItems).toHaveLength(1)
    })
  })

  describe("bulkInsertIfNotExists", () => {
    it("inserts multiple items and returns correct count", async () => {
      const BULK_QUEUE_ID = makeId("bulk_queue_1")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values({
        id: BULK_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Bulk insert test queue",
        slug: "bulk-insert-test-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const items = [
        { traceId: TraceId(makeTrace("bulk_1")), traceCreatedAt: new Date("2025-04-01T10:00:00.000Z") },
        { traceId: TraceId(makeTrace("bulk_2")), traceCreatedAt: new Date("2025-04-01T11:00:00.000Z") },
        { traceId: TraceId(makeTrace("bulk_3")), traceCreatedAt: new Date("2025-04-01T12:00:00.000Z") },
      ]

      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            items,
          })
        }),
      )

      expect(result.insertedCount).toBe(3)

      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            options: { limit: 100 },
          })
        }),
      )

      expect(page.items).toHaveLength(3)
      const traces = new Set(page.items.map((i) => i.traceId as string))
      expect(traces).toEqual(new Set([makeTrace("bulk_1"), makeTrace("bulk_2"), makeTrace("bulk_3")]))
    })

    it("returns 0 when given empty items array", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            items: [],
          })
        }),
      )

      expect(result.insertedCount).toBe(0)
    })

    it("skips existing items and returns only new insert count", async () => {
      const BULK_QUEUE_ID = makeId("bulk_queue_2")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values({
        id: BULK_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Bulk skip test queue",
        slug: "bulk-skip-test-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const firstBatch = [
        { traceId: TraceId(makeTrace("skip_1")), traceCreatedAt: new Date("2025-04-01T10:00:00.000Z") },
        { traceId: TraceId(makeTrace("skip_2")), traceCreatedAt: new Date("2025-04-01T11:00:00.000Z") },
      ]

      const firstResult = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            items: firstBatch,
          })
        }),
      )
      expect(firstResult.insertedCount).toBe(2)

      const secondBatch = [
        { traceId: TraceId(makeTrace("skip_1")), traceCreatedAt: new Date("2025-04-01T10:00:00.000Z") },
        { traceId: TraceId(makeTrace("skip_3")), traceCreatedAt: new Date("2025-04-01T12:00:00.000Z") },
      ]

      const secondResult = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            items: secondBatch,
          })
        }),
      )

      expect(secondResult.insertedCount).toBe(1)

      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByQueue({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            options: { limit: 100 },
          })
        }),
      )

      expect(page.items).toHaveLength(3)
    })

    it("is idempotent - inserting same items twice returns 0 on second call", async () => {
      const BULK_QUEUE_ID = makeId("bulk_queue_3")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values({
        id: BULK_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Bulk idempotent test queue",
        slug: "bulk-idempotent-test-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const items = [
        { traceId: TraceId(makeTrace("idem_1")), traceCreatedAt: new Date("2025-04-01T10:00:00.000Z") },
        { traceId: TraceId(makeTrace("idem_2")), traceCreatedAt: new Date("2025-04-01T11:00:00.000Z") },
      ]

      const firstResult = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            items,
          })
        }),
      )
      expect(firstResult.insertedCount).toBe(2)

      const secondResult = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            items,
          })
        }),
      )
      expect(secondResult.insertedCount).toBe(0)
    })

    it("totalItems counter updates correctly after bulk insert", async () => {
      const BULK_QUEUE_ID = makeId("bulk_queue_4")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values({
        id: BULK_QUEUE_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Bulk counter test queue",
        slug: "bulk-counter-test-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      const items = [
        { traceId: TraceId(makeTrace("cnt_1")), traceCreatedAt: new Date("2025-04-01T10:00:00.000Z") },
        { traceId: TraceId(makeTrace("cnt_2")), traceCreatedAt: new Date("2025-04-01T11:00:00.000Z") },
        { traceId: TraceId(makeTrace("cnt_3")), traceCreatedAt: new Date("2025-04-01T12:00:00.000Z") },
      ]

      const result = await runWithBothLive(
        Effect.gen(function* () {
          const itemsRepo = yield* AnnotationQueueItemRepository
          const queuesRepo = yield* AnnotationQueueRepository

          const { insertedCount } = yield* itemsRepo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            items,
          })

          if (insertedCount > 0) {
            yield* queuesRepo.incrementTotalItems({
              projectId: PROJECT_ID,
              queueId: BULK_QUEUE_ID,
              delta: insertedCount,
            })
          }

          return { insertedCount }
        }),
      )

      expect(result.insertedCount).toBe(3)

      const updatedQueue = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
          })
        }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
      )
      expect(updatedQueue?.totalItems).toBe(3)

      const duplicateItems = [
        { traceId: TraceId(makeTrace("cnt_1")), traceCreatedAt: new Date("2025-04-01T10:00:00.000Z") },
        { traceId: TraceId(makeTrace("cnt_4")), traceCreatedAt: new Date("2025-04-01T13:00:00.000Z") },
      ]

      const secondResult = await runWithBothLive(
        Effect.gen(function* () {
          const itemsRepo = yield* AnnotationQueueItemRepository
          const queuesRepo = yield* AnnotationQueueRepository

          const { insertedCount } = yield* itemsRepo.bulkInsertIfNotExists({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
            items: duplicateItems,
          })

          if (insertedCount > 0) {
            yield* queuesRepo.incrementTotalItems({
              projectId: PROJECT_ID,
              queueId: BULK_QUEUE_ID,
              delta: insertedCount,
            })
          }

          return { insertedCount }
        }),
      )

      expect(secondResult.insertedCount).toBe(1)

      const finalQueue = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({
            projectId: PROJECT_ID,
            queueId: BULK_QUEUE_ID,
          })
        }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
      )
      expect(finalQueue?.totalItems).toBe(4)
    })
  })

  describe("insertManyAcrossQueues", () => {
    it("inserts one trace into multiple queues and returns inserted queue IDs", async () => {
      const QUEUE_A = makeId("cross_queue_a")
      const QUEUE_B = makeId("cross_queue_b")
      const QUEUE_C = makeId("cross_queue_c")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values([
        {
          id: QUEUE_A,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Cross queue A",
          slug: "cross-queue-a",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 0,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
        {
          id: QUEUE_B,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Cross queue B",
          slug: "cross-queue-b",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 0,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
        {
          id: QUEUE_C,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Cross queue C",
          slug: "cross-queue-c",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 0,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
      ])

      const traceId = TraceId(makeTrace("cross_trace"))
      const traceCreatedAt = new Date("2025-04-01T10:00:00.000Z")

      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.insertManyAcrossQueues({
            projectId: PROJECT_ID,
            traceId,
            traceCreatedAt,
            queueIds: [QUEUE_A, QUEUE_B, QUEUE_C],
          })
        }),
      )

      expect(result.insertedQueueIds).toHaveLength(3)
      expect(new Set(result.insertedQueueIds)).toEqual(new Set([QUEUE_A, QUEUE_B, QUEUE_C]))

      // Verify items were created in each queue
      for (const queueId of [QUEUE_A, QUEUE_B, QUEUE_C]) {
        const page = await runWithLive(
          Effect.gen(function* () {
            const repo = yield* AnnotationQueueItemRepository
            return yield* repo.listByQueue({
              projectId: PROJECT_ID,
              queueId,
              options: { limit: 100 },
            })
          }),
        )
        expect(page.items).toHaveLength(1)
        expect(page.items[0]?.traceId).toBe(traceId)
      }
    })

    it("returns empty array when given empty queueIds", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.insertManyAcrossQueues({
            projectId: PROJECT_ID,
            traceId: TraceId(makeTrace("empty_test")),
            traceCreatedAt: new Date(),
            queueIds: [],
          })
        }),
      )

      expect(result.insertedQueueIds).toHaveLength(0)
    })

    it("skips queues where trace already exists and returns only new inserts", async () => {
      const QUEUE_D = makeId("cross_queue_d")
      const QUEUE_E = makeId("cross_queue_e")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values([
        {
          id: QUEUE_D,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Cross queue D",
          slug: "cross-queue-d",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 0,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
        {
          id: QUEUE_E,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Cross queue E",
          slug: "cross-queue-e",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 0,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
      ])

      const traceId = TraceId(makeTrace("partial_trace"))
      const traceCreatedAt = new Date("2025-04-01T10:00:00.000Z")

      // First insert into QUEUE_D only
      const firstResult = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.insertManyAcrossQueues({
            projectId: PROJECT_ID,
            traceId,
            traceCreatedAt,
            queueIds: [QUEUE_D],
          })
        }),
      )
      expect(firstResult.insertedQueueIds).toEqual([QUEUE_D])

      // Second insert into both - should only insert into QUEUE_E
      const secondResult = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.insertManyAcrossQueues({
            projectId: PROJECT_ID,
            traceId,
            traceCreatedAt,
            queueIds: [QUEUE_D, QUEUE_E],
          })
        }),
      )

      expect(secondResult.insertedQueueIds).toHaveLength(1)
      expect(secondResult.insertedQueueIds).toEqual([QUEUE_E])
    })

    it("works correctly with incrementTotalItemsMany for batch counter updates", async () => {
      const QUEUE_F = makeId("cross_queue_f")
      const QUEUE_G = makeId("cross_queue_g")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values([
        {
          id: QUEUE_F,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Cross queue F",
          slug: "cross-queue-f",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 5,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
        {
          id: QUEUE_G,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Cross queue G",
          slug: "cross-queue-g",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 3,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
      ])

      const traceId = TraceId(makeTrace("batch_counter"))
      const traceCreatedAt = new Date("2025-04-01T10:00:00.000Z")

      await runWithBothLive(
        Effect.gen(function* () {
          const itemsRepo = yield* AnnotationQueueItemRepository
          const queuesRepo = yield* AnnotationQueueRepository

          const { insertedQueueIds } = yield* itemsRepo.insertManyAcrossQueues({
            projectId: PROJECT_ID,
            traceId,
            traceCreatedAt,
            queueIds: [QUEUE_F, QUEUE_G],
          })

          yield* queuesRepo.incrementTotalItemsMany({
            projectId: PROJECT_ID,
            queueIds: insertedQueueIds,
          })
        }),
      )

      const queueF = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: QUEUE_F })
        }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
      )
      const queueG = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: QUEUE_G })
        }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
      )

      expect(queueF?.totalItems).toBe(6) // 5 + 1
      expect(queueG?.totalItems).toBe(4) // 3 + 1
    })
  })

  describe("getAdjacentItems", () => {
    it("returns prev and next for item in middle of list", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getAdjacentItems({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("it_pend_new"),
          })
        }),
      )

      // Order is by traceCreatedAt DESC: it_pend_old (12:00) → it_pend_new (09:00) → it_prog → it_done
      expect(result.previousItemId).toBe(makeId("it_pend_old"))
      expect(result.nextItemId).toBe(makeId("it_prog"))
    })

    it("returns null for prev when on first item in list order", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getAdjacentItems({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("it_pend_old"),
          })
        }),
      )

      // it_pend_old has newer traceCreatedAt so it's first
      expect(result.previousItemId).toBeNull()
      expect(result.nextItemId).toBe(makeId("it_pend_new"))
    })

    it("returns null for next when on last item in list order", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getAdjacentItems({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("it_done"),
          })
        }),
      )

      expect(result.previousItemId).toBe(makeId("it_prog"))
      expect(result.nextItemId).toBeNull()
    })

    it("returns null for both when item not found", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getAdjacentItems({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("nonexistent"),
          })
        }),
      )

      expect(result.previousItemId).toBeNull()
      expect(result.nextItemId).toBeNull()
    })
  })

  describe("getQueuePosition", () => {
    it("returns position 1 for first item in list order", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getQueuePosition({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            // it_pend_old has newer traceCreatedAt so it's first
            currentItemId: makeId("it_pend_old"),
          })
        }),
      )

      expect(result.currentIndex).toBe(1)
      expect(result.totalItems).toBe(4)
    })

    it("returns correct position for middle item", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getQueuePosition({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("it_prog"),
          })
        }),
      )

      expect(result.currentIndex).toBe(3)
      expect(result.totalItems).toBe(4)
    })

    it("returns position 4 for last item", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getQueuePosition({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("it_done"),
          })
        }),
      )

      expect(result.currentIndex).toBe(4)
      expect(result.totalItems).toBe(4)
    })

    it("returns 0 index when item not found", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getQueuePosition({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("nonexistent"),
          })
        }),
      )

      expect(result.currentIndex).toBe(0)
      expect(result.totalItems).toBe(4)
    })
  })

  describe("getNextUncompletedItem", () => {
    it("returns first uncompleted item in list order", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getNextUncompletedItem({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("it_done"),
          })
        }),
      )

      // it_pend_old has newer traceCreatedAt so it's first uncompleted
      expect(result).toBe(makeId("it_pend_old"))
    })

    it("returns first uncompleted even when called from uncompleted item", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getNextUncompletedItem({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("it_pend_new"),
          })
        }),
      )

      // it_pend_old has newer traceCreatedAt so it's first uncompleted
      expect(result).toBe(makeId("it_pend_old"))
    })

    it("returns first uncompleted when current item not found", async () => {
      const result = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.getNextUncompletedItem({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            currentItemId: makeId("nonexistent"),
          })
        }),
      )

      // it_pend_old has newer traceCreatedAt so it's first uncompleted
      expect(result).toBe(makeId("it_pend_old"))
    })
  })

  describe("update", () => {
    it("updates completedAt and completedBy", async () => {
      const userId = makeId("uu_updater")
      const completedAt = new Date("2025-05-01T00:00:00.000Z")

      const updated = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.update({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            itemId: makeId("it_prog"),
            completedAt,
            completedBy: userId,
          })
        }),
      )

      expect(updated.completedAt).toEqual(completedAt)
      expect(updated.completedBy).toBe(userId)
    })

    it("clears completedAt and completedBy when set to null", async () => {
      const updated = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.update({
            projectId: PROJECT_ID,
            queueId: QUEUE_ID,
            itemId: makeId("it_done"),
            completedAt: null,
            completedBy: null,
          })
        }),
      )

      expect(updated.completedAt).toBeNull()
      expect(updated.completedBy).toBeNull()
    })

    it("fails with NotFoundError for non-existent item", async () => {
      const err = await Effect.runPromise(
        Effect.match(
          Effect.gen(function* () {
            const repo = yield* AnnotationQueueItemRepository
            return yield* repo.update({
              projectId: PROJECT_ID,
              queueId: QUEUE_ID,
              itemId: makeId("nonexistent"),
              completedAt: new Date(),
              completedBy: makeId("uu_user"),
            })
          }).pipe(withPostgres(AnnotationQueueItemRepositoryLive, pg.adminPostgresClient, ORG_ID)),
          {
            onFailure: (e) => e,
            onSuccess: () => {
              throw new Error("expected failure")
            },
          },
        ),
      )

      expect(err._tag).toBe("NotFoundError")
    })
  })

  describe("listByTraceId", () => {
    it("returns items matching the traceId", async () => {
      const items = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByTraceId({
            projectId: PROJECT_ID,
            traceId: makeTrace("pend1"),
          })
        }),
      )

      expect(items.length).toBe(1)
      expect(items[0]?.traceId).toBe(makeTrace("pend1"))
    })

    it("returns empty array when no items match the traceId", async () => {
      const items = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByTraceId({
            projectId: PROJECT_ID,
            traceId: makeTrace("nonexistent"),
          })
        }),
      )

      expect(items.length).toBe(0)
    })

    it("respects projectId scoping", async () => {
      const items = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueItemRepository
          return yield* repo.listByTraceId({
            projectId: OTHER_PROJECT_ID,
            traceId: makeTrace("pend2"),
          })
        }),
      )

      expect(items.length).toBe(0)
    })
  })
})
