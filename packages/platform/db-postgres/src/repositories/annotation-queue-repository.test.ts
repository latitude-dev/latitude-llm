import { AnnotationQueueRepository } from "@domain/annotation-queues"
import { CacheStore, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
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

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AnnotationQueueRepository>) =>
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

  describe("cache eviction", () => {
    it("evicts the project system-queue cache after save", async () => {
      const deletedKeys: string[] = []

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository

          yield* repo.save({
            id: makeId("q_systemsave"),
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            system: true,
            name: "Saved system queue",
            slug: "saved-system-queue",
            description: "",
            instructions: "",
            settings: emptySettings,
            assignees: [],
            totalItems: 0,
            completedItems: 0,
            deletedAt: null,
            createdAt: new Date("2025-01-04T12:00:00.000Z"),
            updatedAt: new Date("2025-01-04T12:00:00.000Z"),
          })
        }).pipe(
          Effect.provideService(CacheStore, {
            get: () => Effect.succeed(null),
            set: () => Effect.void,
            delete: (key) => Effect.sync(() => deletedKeys.push(key)),
          }),
        ),
      )

      expect(deletedKeys).toEqual([`org:${ORG_ID}:projects:${PROJECT_ID}:system-queues`])
    })

    it("evicts the project system-queue cache when a system queue is inserted", async () => {
      const deletedKeys: string[] = []

      const wasInserted = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* AnnotationQueueRepository

          return yield* repo.insertIfNotExists({
            id: makeId("q_systemins"),
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            system: true,
            name: "Inserted system queue",
            slug: "inserted-system-queue",
            description: "",
            instructions: "",
            settings: emptySettings,
            assignees: [],
            totalItems: 0,
            completedItems: 0,
            deletedAt: null,
            createdAt: new Date("2025-01-05T12:00:00.000Z"),
            updatedAt: new Date("2025-01-05T12:00:00.000Z"),
          })
        }).pipe(
          Effect.provideService(CacheStore, {
            get: () => Effect.succeed(null),
            set: () => Effect.void,
            delete: (key) => Effect.sync(() => deletedKeys.push(key)),
          }),
        ),
      )

      expect(wasInserted).toBe(true)
      expect(deletedKeys).toEqual([`org:${ORG_ID}:projects:${PROJECT_ID}:system-queues`])
    })
  })
})
