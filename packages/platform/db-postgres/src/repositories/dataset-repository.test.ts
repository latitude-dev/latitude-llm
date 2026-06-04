import { DatasetRepository } from "@domain/datasets"
import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { datasets } from "../schema/datasets.ts"
import { datasetVersions } from "../schema/datasetVersions.ts"
import { projects } from "../schema/projects.ts"
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
        slug: "apple",
        name: "Apple",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 1),
      },
      {
        id: makeId("ds2"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "banana",
        name: "Banana",
        currentVersion: 1,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 2),
      },
      {
        id: makeId("ds3"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "cherry",
        name: "Cherry",
        currentVersion: 1,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 3),
      },
      {
        id: makeId("ds4"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "date-fruit",
        name: "Date",
        currentVersion: 1,
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 4),
      },
      {
        id: makeId("ds5"),
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        slug: "elderberry",
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

  describe("findBySlug", () => {
    it("returns the dataset matching `(projectId, slug)`", async () => {
      const dataset = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DatasetRepository
          return yield* repo.findBySlug({ projectId: PROJECT_ID, slug: "banana" })
        }),
      )

      expect(dataset.name).toBe("Banana")
      expect(dataset.slug).toBe("banana")
      expect(dataset.id).toBe(makeId("ds2"))
    })

    it("raises DatasetNotFoundError when no dataset matches the slug in the project", async () => {
      await expect(
        runWithLive(
          Effect.gen(function* () {
            const repo = yield* DatasetRepository
            return yield* repo.findBySlug({ projectId: PROJECT_ID, slug: "does-not-exist" })
          }),
        ),
      ).rejects.toThrow()
    })
  })
})

const SEARCH_ORG_ID = OrganizationId("org-search-ds-test")
const SEARCH_OTHER_ORG_ID = OrganizationId("org-search-ds-other")
const SEARCH_PROJECT_A = ProjectId("proj-search-ds-a")
const SEARCH_PROJECT_B = ProjectId("proj-search-ds-b")
const SEARCH_PROJECT_DELETED = ProjectId("proj-search-ds-del")
const SEARCH_PROJECT_OTHER = ProjectId("proj-search-ds-oth")

describe("DatasetRepositoryLive searchOrgWide", () => {
  const runSearch = <A, E>(effect: Effect.Effect<A, E, DatasetRepository | SqlClient>) =>
    Effect.runPromise(effect.pipe(withPostgres(DatasetRepositoryLive, pg.adminPostgresClient, SEARCH_ORG_ID)))

  beforeAll(async () => {
    const db = pg.db
    const baseTime = new Date("2025-02-01T12:00:00.000Z")

    await db.insert(projects).values([
      { id: SEARCH_PROJECT_A, organizationId: SEARCH_ORG_ID, name: "Alpha Project", slug: "alpha" },
      { id: SEARCH_PROJECT_B, organizationId: SEARCH_ORG_ID, name: "Beta Project", slug: "beta" },
      {
        id: SEARCH_PROJECT_DELETED,
        organizationId: SEARCH_ORG_ID,
        name: "Gone Project",
        slug: "gone",
        deletedAt: baseTime,
      },
      { id: SEARCH_PROJECT_OTHER, organizationId: SEARCH_OTHER_ORG_ID, name: "Other Org Project", slug: "other" },
    ])

    await db.insert(datasets).values([
      {
        id: makeId("sds1"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_A,
        slug: "customer-reviews",
        name: "Customer Reviews",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("sds2"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_B,
        slug: "customer-orders",
        name: "Customer Orders",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("sds3"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_A,
        slug: "unrelated",
        name: "Unrelated Logs",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("sds4"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_A,
        slug: "customer-deleted",
        name: "Customer Deleted",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
        deletedAt: baseTime,
      },
      {
        id: makeId("sds5"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_DELETED,
        slug: "customer-in-deleted-project",
        name: "Customer In Deleted Project",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("sds6"),
        organizationId: SEARCH_OTHER_ORG_ID,
        projectId: SEARCH_PROJECT_OTHER,
        slug: "customer-secret",
        name: "Customer Secret",
        currentVersion: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])
  })

  it("matches datasets across multiple projects in the org and tags them with the project", async () => {
    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.searchOrgWide({ searchQuery: "customer", limit: 25 })
      }),
    )

    expect(results.map((r) => r.name).sort()).toEqual(["Customer Orders", "Customer Reviews"])
    const reviews = results.find((r) => r.name === "Customer Reviews")
    const orders = results.find((r) => r.name === "Customer Orders")
    expect(reviews).toMatchObject({ projectId: SEARCH_PROJECT_A, projectSlug: "alpha", projectName: "Alpha Project" })
    expect(orders).toMatchObject({ projectId: SEARCH_PROJECT_B, projectSlug: "beta", projectName: "Beta Project" })
  })

  it("excludes soft-deleted datasets, datasets in soft-deleted projects, and other organizations", async () => {
    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.searchOrgWide({ searchQuery: "customer", limit: 25 })
      }),
    )
    const names = results.map((r) => r.name)
    expect(names).not.toContain("Customer Deleted")
    expect(names).not.toContain("Customer In Deleted Project")
    expect(names).not.toContain("Customer Secret")
  })

  it("respects the limit", async () => {
    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.searchOrgWide({ searchQuery: "customer", limit: 1 })
      }),
    )
    expect(results).toHaveLength(1)
  })

  it("orders by name-match quality: exact, then prefix, then substring", async () => {
    const t = new Date("2025-02-02T12:00:00.000Z")
    await pg.db.insert(datasets).values([
      // Inserted substring-first to prove ordering isn't just insertion/recency order.
      {
        id: makeId("dsm3"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_A,
        slug: "my-zebra-log",
        name: "My Zebra Log",
        currentVersion: 0,
        createdAt: t,
        updatedAt: t,
      },
      {
        id: makeId("dsm2"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_A,
        slug: "zebra-report",
        name: "Zebra Report",
        currentVersion: 0,
        createdAt: t,
        updatedAt: t,
      },
      {
        id: makeId("dsm1"),
        organizationId: SEARCH_ORG_ID,
        projectId: SEARCH_PROJECT_A,
        slug: "zebra",
        name: "Zebra",
        currentVersion: 0,
        createdAt: t,
        updatedAt: t,
      },
    ])

    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.searchOrgWide({ searchQuery: "zebra", limit: 25 })
      }),
    )
    expect(results.map((r) => r.name)).toEqual(["Zebra", "Zebra Report", "My Zebra Log"])
  })

  it("ranks the preferred project's datasets first", async () => {
    // "Customer Reviews" (project A) and "Customer Orders" (project B) score equally for "customer".
    const withoutPreference = await runSearch(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.searchOrgWide({ searchQuery: "customer", limit: 25 })
      }),
    )
    expect(withoutPreference.map((r) => r.name).sort()).toEqual(["Customer Orders", "Customer Reviews"])

    const preferB = await runSearch(
      Effect.gen(function* () {
        const repo = yield* DatasetRepository
        return yield* repo.searchOrgWide({ searchQuery: "customer", preferProjectId: SEARCH_PROJECT_B, limit: 25 })
      }),
    )
    // Project B's dataset now leads, even though match quality/recency are equal.
    expect(preferB[0]?.name).toBe("Customer Orders")
    expect(preferB[0]?.projectId).toBe(SEARCH_PROJECT_B)
  })
})
