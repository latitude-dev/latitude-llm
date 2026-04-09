import { AnnotationQueueItemRepository, annotationQueueItemStatusRankFromTimestamps } from "@domain/annotation-queues"
import { OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { annotationQueueItems, annotationQueues } from "../schema/annotation-queues.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AnnotationQueueItemRepositoryLive } from "./annotation-queue-item-repository.ts"

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

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AnnotationQueueItemRepository>) =>
  Effect.runPromise(effect.pipe(withPostgres(AnnotationQueueItemRepositoryLive, pg.adminPostgresClient, ORG_ID)))

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
      // Within rank 0: createdAt desc, so newer pending before older
      expect(page.items[0].traceId).toEqual(TraceId(makeTrace("pend2")))
      expect(page.items[1].traceId).toEqual(TraceId(makeTrace("pend1")))
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
                cursor: { sortValue: new Date().toISOString(), id: makeId("it_pend_new") },
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
})
