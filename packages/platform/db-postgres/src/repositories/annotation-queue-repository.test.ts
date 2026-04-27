import { AnnotationQueueRepository } from "@domain/annotation-queues"
import { OrganizationId, ProjectId, RepositoryError, type SqlClient } from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { annotationQueues } from "../schema/annotation-queues.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AnnotationQueueRepositoryLive } from "./annotation-queue-repository.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")
const OTHER_PROJECT_ID = ProjectId("qqqqqqqqqqqqqqqqqqqqqqqq")
const LIMIT = 2

const emptySettings = {} as const

function makeId(prefix: string): string {
  return prefix.padEnd(24, "x").slice(0, 24)
}

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AnnotationQueueRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)))

describe("AnnotationQueueRepositoryLive", () => {
  beforeAll(async () => {
    const db = pg.db
    const t0 = new Date("2025-01-01T12:00:00.000Z")
    const t1 = new Date("2025-01-02T12:00:00.000Z")
    const t2 = new Date("2025-01-03T12:00:00.000Z")

    await db.insert(annotationQueues).values([
      {
        id: makeId("q_deleted"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Deleted queue",
        slug: "deleted-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: new Date("2025-06-01T00:00:00.000Z"),
        createdAt: t0,
        updatedAt: t0,
      },
      {
        id: makeId("q_old"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Zebra",
        slug: "zebra",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 10,
        completedItems: 3,
        deletedAt: null,
        createdAt: t0,
        updatedAt: t0,
      },
      {
        id: makeId("q_mid"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Mango",
        slug: "mango",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 8,
        completedItems: 8,
        deletedAt: null,
        createdAt: t1,
        updatedAt: t1,
      },
      {
        id: makeId("q_new"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Apple",
        slug: "apple",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 5,
        completedItems: 0,
        deletedAt: null,
        createdAt: t2,
        updatedAt: t2,
      },
      {
        id: makeId("q_other"),
        organizationId: ORG_ID,
        projectId: OTHER_PROJECT_ID,
        system: false,
        name: "Other project",
        slug: "other-project",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 0,
        completedItems: 0,
        deletedAt: null,
        createdAt: t2,
        updatedAt: t2,
      },
    ])
  })

  describe("listByProject", () => {
    it("excludes soft-deleted queues and scopes to projectId", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { limit: 20 },
          })
        }),
      )

      const names = page.items.map((q) => q.name).sort()
      expect(names).toEqual(["Apple", "Mango", "Zebra"])
      expect(page.items.some((q) => q.name === "Deleted queue")).toBe(false)
      expect(page.items.some((q) => q.name === "Other project")).toBe(false)
    })

    it("sorts by createdAt descending by default", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { limit: 10 },
          })
        }),
      )

      expect(page.items.map((q) => q.name)).toEqual(["Apple", "Mango", "Zebra"])
    })

    it("sorts by name ascending with keyset pagination", async () => {
      const first = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { sortBy: "name", sortDirection: "asc", limit: LIMIT },
          })
        }),
      )

      expect(first.items.map((q) => q.name)).toEqual(["Apple", "Mango"])
      expect(first.hasMore).toBe(true)
      expect(first.nextCursor).toBeDefined()

      const cursor = first.nextCursor
      if (cursor === undefined) throw new Error("expected nextCursor")

      const second = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: {
              sortBy: "name",
              sortDirection: "asc",
              limit: LIMIT,
              cursor,
            },
          })
        }),
      )

      expect(second.items.map((q) => q.name)).toEqual(["Zebra"])
      expect(second.hasMore).toBe(false)
      expect(second.nextCursor).toBeUndefined()
    })

    it("sorts by pendingItems ascending (totalItems - completedItems)", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { sortBy: "pendingItems", sortDirection: "asc", limit: 10 },
          })
        }),
      )

      // Mango: 0 pending, Apple: 5 pending, Zebra: 7 pending
      expect(page.items.map((q) => q.name)).toEqual(["Mango", "Apple", "Zebra"])
    })

    it("fails with RepositoryError when cursor sortValue is invalid for createdAt sort", async () => {
      const err = await Effect.runPromise(
        Effect.match(
          Effect.gen(function* () {
            const repo = yield* AnnotationQueueRepository
            return yield* repo.listByProject({
              projectId: PROJECT_ID,
              options: {
                sortBy: "createdAt",
                sortDirection: "desc",
                limit: 5,
                cursor: { sortValue: "not-a-timestamp", id: makeId("q_new") },
              },
            })
          }).pipe(withPostgres(AnnotationQueueRepositoryLive, pg.adminPostgresClient, ORG_ID)),
          {
            onFailure: (e) => e,
            onSuccess: () => {
              throw new Error("expected failure")
            },
          },
        ),
      )

      expect(err).toBeInstanceOf(RepositoryError)
      expect(err.operation).toBe("listByProject")
    })
  })

  describe("findByIdInProject", () => {
    it("returns the queue when id matches within the project", async () => {
      const q = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_mid") })
        }),
      )

      expect(q).not.toBeNull()
      expect(q?.name).toBe("Mango")
    })

    it("returns null for soft-deleted queue", async () => {
      const q = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_deleted") })
        }),
      )

      expect(q).toBeNull()
    })

    it("returns null when queue belongs to another project", async () => {
      const q = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_other") })
        }),
      )

      expect(q).toBeNull()
    })
  })

  describe("incrementCompletedItems", () => {
    it("increments the counter by positive delta", async () => {
      const before = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_old") })
        }),
      )
      expect(before?.completedItems).toBe(3)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          yield* repo.incrementCompletedItems({
            projectId: PROJECT_ID,
            queueId: makeId("q_old"),
            delta: 2,
          })
        }),
      )

      const after = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_old") })
        }),
      )
      expect(after?.completedItems).toBe(5)
    })

    it("decrements the counter by negative delta", async () => {
      const before = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_mid") })
        }),
      )
      expect(before?.completedItems).toBe(8)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          yield* repo.incrementCompletedItems({
            projectId: PROJECT_ID,
            queueId: makeId("q_mid"),
            delta: -3,
          })
        }),
      )

      const after = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_mid") })
        }),
      )
      expect(after?.completedItems).toBe(5)
    })

    it("does not go below zero", async () => {
      const before = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_new") })
        }),
      )
      expect(before?.completedItems).toBe(0)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          yield* repo.incrementCompletedItems({
            projectId: PROJECT_ID,
            queueId: makeId("q_new"),
            delta: -5,
          })
        }),
      )

      const after = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: makeId("q_new") })
        }),
      )
      expect(after?.completedItems).toBe(0)
    })
  })

  describe("incrementTotalItemsMany", () => {
    it("increments totalItems for multiple queues in a single operation", async () => {
      const QUEUE_M1 = makeId("inc_many_q1")
      const QUEUE_M2 = makeId("inc_many_q2")
      const QUEUE_M3 = makeId("inc_many_q3")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values([
        {
          id: QUEUE_M1,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Inc many queue 1",
          slug: "inc-many-queue-1",
          description: "",
          instructions: "",
          settings: emptySettings,
          assignees: [],
          totalItems: 10,
          completedItems: 0,
          deletedAt: null,
          createdAt: base,
          updatedAt: base,
        },
        {
          id: QUEUE_M2,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Inc many queue 2",
          slug: "inc-many-queue-2",
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
          id: QUEUE_M3,
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          system: false,
          name: "Inc many queue 3",
          slug: "inc-many-queue-3",
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

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          yield* repo.incrementTotalItemsMany({
            projectId: PROJECT_ID,
            queueIds: [QUEUE_M1, QUEUE_M2, QUEUE_M3],
          })
        }),
      )

      const q1 = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: QUEUE_M1 })
        }),
      )
      const q2 = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: QUEUE_M2 })
        }),
      )
      const q3 = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: QUEUE_M3 })
        }),
      )

      expect(q1?.totalItems).toBe(11) // 10 + 1
      expect(q2?.totalItems).toBe(6) // 5 + 1
      expect(q3?.totalItems).toBe(1) // 0 + 1
    })

    it("does nothing when given empty queueIds array", async () => {
      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          yield* repo.incrementTotalItemsMany({
            projectId: PROJECT_ID,
            queueIds: [],
          })
        }),
      )

      // No error thrown - operation completes successfully
    })

    it("only increments queues that exist and match projectId", async () => {
      const QUEUE_EXISTS = makeId("inc_exists")
      const QUEUE_NONEXISTENT = makeId("inc_noexist")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values({
        id: QUEUE_EXISTS,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Exists queue",
        slug: "exists-queue",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 7,
        completedItems: 0,
        deletedAt: null,
        createdAt: base,
        updatedAt: base,
      })

      // Include both existing and non-existing queue IDs
      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          yield* repo.incrementTotalItemsMany({
            projectId: PROJECT_ID,
            queueIds: [QUEUE_EXISTS, QUEUE_NONEXISTENT],
          })
        }),
      )

      const existingQueue = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          return yield* repo.findByIdInProject({ projectId: PROJECT_ID, queueId: QUEUE_EXISTS })
        }),
      )

      expect(existingQueue?.totalItems).toBe(8) // 7 + 1
    })

    it("does not increment deleted queues", async () => {
      const QUEUE_DELETED = makeId("inc_deleted")
      const db = pg.db
      const base = new Date()

      await db.insert(annotationQueues).values({
        id: QUEUE_DELETED,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        system: false,
        name: "Deleted queue for inc",
        slug: "deleted-queue-for-inc",
        description: "",
        instructions: "",
        settings: emptySettings,
        assignees: [],
        totalItems: 5,
        completedItems: 0,
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        createdAt: base,
        updatedAt: base,
      })

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository
          yield* repo.incrementTotalItemsMany({
            projectId: PROJECT_ID,
            queueIds: [QUEUE_DELETED],
          })
        }),
      )

      // Query directly since findByIdInProject excludes deleted queues
      const rows = await db.select().from(annotationQueues).where(eq(annotationQueues.id, QUEUE_DELETED))

      expect(rows[0]?.totalItems).toBe(5) // Unchanged
    })
  })
})
