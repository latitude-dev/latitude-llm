import { DatasetRepository } from "@domain/datasets"
import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { datasets } from "../schema/datasets.ts"
import { datasetVersions } from "../schema/datasetVersions.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { DatasetRepositoryLive } from "./dataset-repository.ts"

const ORG_ID = OrganizationId("org-list-datasets-test")
const PROJECT_ID = ProjectId("proj-list-datasets-test")
const LIMIT = 3

function makeId(prefix: string): string {
  return prefix.padEnd(24, "x").slice(0, 24)
}

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, DatasetRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(DatasetRepositoryLive, pg.adminPostgresClient, ORG_ID)))

describe("DatasetRepositoryLive listByProject", () => {
  beforeAll(async () => {
    const db = pg.db
    const baseTime = new Date("2025-01-01T12:00:00.000Z")

    await db.insert(datasets).values([
      {
        id: makeId("ds1"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        name: "Apple",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 1),
      },
      {
        id: makeId("ds2"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        name: "Banana",
        currentVersion: 1,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 2),
      },
      {
        id: makeId("ds3"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        name: "Cherry",
        currentVersion: 1,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 3),
      },
      {
        id: makeId("ds4"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        name: "Date",
        currentVersion: 1,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 4),
      },
      {
        id: makeId("ds5"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        name: "Elderberry",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 5),
      },
    ])

    const versionId2 = makeId("dv2")
    const versionId3 = makeId("dv3")
    const versionId4 = makeId("dv4")
    await db.insert(datasetVersions).values([
      {
        id: versionId2,
        organizationId: ORG_ID,
        datasetId: makeId("ds2"),
        version: 1,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: versionId3,
        organizationId: ORG_ID,
        datasetId: makeId("ds3"),
        version: 1,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: versionId4,
        organizationId: ORG_ID,
        datasetId: makeId("ds4"),
        version: 1,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])
  })

  describe("sort", () => {
    it("sorts by name ascending with limit 3", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { sortBy: "name", sortDirection: "asc", limit: LIMIT },
          })
        }),
      )

      expect(page.datasets).toHaveLength(3)
      expect(page.datasets[0].name).toBe("Apple")
      expect(page.datasets[1].name).toBe("Banana")
      expect(page.datasets[2].name).toBe("Cherry")
      expect(page.hasMore).toBe(true)
      expect(page.nextCursor).toBeDefined()
      expect(page.nextCursor?.sortValue).toBe("Cherry")
      expect(page.nextCursor?.id).toBe(makeId("ds3"))
    })

    it("sorts by name descending with limit 3", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { sortBy: "name", sortDirection: "desc", limit: LIMIT },
          })
        }),
      )

      expect(page.datasets).toHaveLength(3)
      expect(page.datasets[0].name).toBe("Elderberry")
      expect(page.datasets[1].name).toBe("Date")
      expect(page.datasets[2].name).toBe("Cherry")
      expect(page.hasMore).toBe(true)
      expect(page.nextCursor?.sortValue).toBe("Cherry")
      expect(page.nextCursor?.id).toBe(makeId("ds3"))
    })

    it("sorts by updatedAt ascending with limit 3", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { sortBy: "updatedAt", sortDirection: "asc", limit: LIMIT },
          })
        }),
      )

      expect(page.datasets).toHaveLength(3)
      expect(page.datasets[0].name).toBe("Apple")
      expect(page.datasets[1].name).toBe("Banana")
      expect(page.datasets[2].name).toBe("Cherry")
      expect(page.hasMore).toBe(true)
      expect(page.nextCursor?.sortValue).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(page.nextCursor?.id).toBe(makeId("ds3"))
    })

    it("sorts by updatedAt descending with limit 3", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { sortBy: "updatedAt", sortDirection: "desc", limit: LIMIT },
          })
        }),
      )

      expect(page.datasets).toHaveLength(3)
      expect(page.datasets[0].name).toBe("Elderberry")
      expect(page.datasets[1].name).toBe("Date")
      expect(page.datasets[2].name).toBe("Cherry")
      expect(page.hasMore).toBe(true)
      expect(page.nextCursor?.id).toBe(makeId("ds3"))
    })
  })

  describe("versioning join", () => {
    it("joins current version so latestVersionId is set when version row exists", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { limit: 10 },
          })
        }),
      )

      const withVersion = page.datasets.filter((d) => d.latestVersionId !== null)
      const withoutVersion = page.datasets.filter((d) => d.latestVersionId === null)

      expect(withVersion.map((d) => d.name).sort()).toEqual(["Banana", "Cherry", "Date"])
      expect(withoutVersion.map((d) => d.name).sort()).toEqual(["Apple", "Elderberry"])

      const banana = page.datasets.find((d) => d.name === "Banana")
      const apple = page.datasets.find((d) => d.name === "Apple")
      expect(banana?.currentVersion).toBe(1)
      expect(banana?.latestVersionId).toBe(makeId("dv2"))
      expect(apple?.currentVersion).toBe(0)
      expect(apple?.latestVersionId).toBeNull()
    })
  })

  describe("keyset pagination", () => {
    it("returns first page of 3 and nextCursor, second page returns remaining without duplicates", async () => {
      const first = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { sortBy: "name", sortDirection: "asc", limit: LIMIT },
          })
        }),
      )

      expect(first.datasets).toHaveLength(3)
      expect(first.hasMore).toBe(true)
      expect(first.nextCursor).toBeDefined()

      const cursor = first.nextCursor
      const second = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: {
              sortBy: "name",
              sortDirection: "asc",
              limit: LIMIT,
              ...(cursor !== undefined && { cursor }),
            },
          })
        }),
      )

      expect(second.datasets).toHaveLength(2)
      expect(second.datasets[0].name).toBe("Date")
      expect(second.datasets[1].name).toBe("Elderberry")
      expect(second.hasMore).toBe(false)
      expect(second.nextCursor).toBeUndefined()

      const allIds = [...first.datasets.map((d) => d.id), ...second.datasets.map((d) => d.id)]
      const uniqueIds = new Set(allIds)
      expect(uniqueIds.size).toBe(5)
    })
  })

  describe("output shape", () => {
    it("returns DatasetListPage with datasets array, hasMore, and optional nextCursor", async () => {
      const page = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.listByProject({
            projectId: PROJECT_ID,
            options: { limit: LIMIT },
          })
        }),
      )

      expect(page).toMatchObject({
        datasets: expect.any(Array),
        hasMore: expect.any(Boolean),
      })
      expect(Array.isArray(page.datasets)).toBe(true)
      expect(typeof page.hasMore).toBe("boolean")

      for (const d of page.datasets) {
        expect(d).toMatchObject({
          id: expect.any(String),
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          name: expect.any(String),
          description: null,
          fileKey: null,
          currentVersion: expect.any(Number),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
        expect(d.latestVersionId === null || typeof d.latestVersionId === "string").toBe(true)
      }

      if (page.hasMore) {
        expect(page.nextCursor).toMatchObject({
          sortValue: expect.any(String),
          id: expect.any(String),
        })
      }
    })
  })
})
