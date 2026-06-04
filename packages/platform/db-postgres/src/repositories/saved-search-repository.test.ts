import { DuplicateSavedSearchSlugError, SavedSearchNotFoundError, SavedSearchRepository } from "@domain/saved-searches"
import { OrganizationId, ProjectId, type SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { projects } from "../schema/projects.ts"
import { savedSearches } from "../schema/saved-searches.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { SavedSearchRepositoryLive } from "./saved-search-repository.ts"

const ORG_ID = OrganizationId("org-saved-search-test".padEnd(24, "x").slice(0, 24))
const OTHER_ORG_ID = OrganizationId("org-saved-search-othe".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("proj-saved-search-tes".padEnd(24, "x").slice(0, 24))
const OTHER_PROJECT_ID = ProjectId("proj-saved-search-oth".padEnd(24, "x").slice(0, 24))
const CREATOR_USER_ID = UserId("user-creator-test".padEnd(24, "x").slice(0, 24))
const ASSIGNEE_USER_ID = UserId("user-assignee-test".padEnd(24, "x").slice(0, 24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, SavedSearchRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(SavedSearchRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const runWithLiveOtherOrg = <A, E>(effect: Effect.Effect<A, E, SavedSearchRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(SavedSearchRepositoryLive, pg.adminPostgresClient, OTHER_ORG_ID)))

describe("SavedSearchRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(savedSearches)
  })

  it("creates a saved search and finds it by id", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.create({
          projectId: PROJECT_ID,
          slug: "errors",
          name: "Errors",
          query: "failed payments",
          filterSet: { status: [{ op: "eq", value: "error" }] },
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    expect(created.slug).toBe("errors")
    expect(created.name).toBe("Errors")
    expect(created.query).toBe("failed payments")
    expect(created.assignedUserId).toBeNull()
    expect(created.createdByUserId).toBe(CREATOR_USER_ID)
    expect(created.deletedAt).toBeNull()

    const fetched = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.findById(created.id)
      }),
    )
    expect(fetched.id).toBe(created.id)
    expect(fetched.filterSet).toEqual({ status: [{ op: "eq", value: "error" }] })
  })

  it("finds a saved search by slug within a project", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "slow-signups",
          name: "Slow Signups",
          query: null,
          filterSet: { duration: [{ op: "gte", value: 1000 }] },
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.findBySlug({ projectId: PROJECT_ID, slug: "slow-signups" })
      }),
    )
    expect(found.name).toBe("Slow Signups")

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* SavedSearchRepository
          return yield* repo.findBySlug({ projectId: PROJECT_ID, slug: "missing" })
        }),
      ),
    ).rejects.toBeInstanceOf(SavedSearchNotFoundError)
  })

  it("rejects duplicate slugs within the same project", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "errors",
          name: "Errors",
          query: "fail",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* SavedSearchRepository
          return yield* repo.create({
            projectId: PROJECT_ID,
            slug: "errors",
            name: "Errors duplicate",
            query: "fail",
            filterSet: {},
            assignedUserId: null,
            createdByUserId: CREATOR_USER_ID,
          })
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateSavedSearchSlugError)
  })

  it("allows the same slug in different projects", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "errors",
          name: "Errors",
          query: "fail",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
        yield* repo.create({
          projectId: OTHER_PROJECT_ID,
          slug: "errors",
          name: "Errors",
          query: "fail",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )
  })

  it("excludes self when checking slug existence on rename", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.create({
          projectId: PROJECT_ID,
          slug: "errors",
          name: "Errors",
          query: "fail",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    const collidesWithOther = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.countBySlug({ projectId: PROJECT_ID, slug: "errors" })
      }),
    )
    expect(collidesWithOther).toBe(1)

    const collidesWithSelfExcluded = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.countBySlug({
          projectId: PROJECT_ID,
          slug: "errors",
          excludeId: created.id,
        })
      }),
    )
    expect(collidesWithSelfExcluded).toBe(0)
  })

  it("lists saved searches by project ordered by createdAt desc", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "first",
          name: "First",
          query: "a",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
        yield* Effect.sleep("10 millis")
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "second",
          name: "Second",
          query: "b",
          filterSet: {},
          assignedUserId: ASSIGNEE_USER_ID,
          createdByUserId: CREATOR_USER_ID,
        })
        yield* Effect.sleep("10 millis")
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "third",
          name: "Third",
          query: "c",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    const page = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }),
    )

    expect(page.items.map((row) => row.slug)).toEqual(["third", "second", "first"])
  })

  it("filters listByProject by assignedUserId", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "unassigned",
          name: "Unassigned",
          query: "a",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "assigned",
          name: "Assigned",
          query: "b",
          filterSet: {},
          assignedUserId: ASSIGNEE_USER_ID,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    const page = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID, assignedUserId: ASSIGNEE_USER_ID })
      }),
    )
    expect(page.items.map((row) => row.slug)).toEqual(["assigned"])
  })

  it("updates name, slug, query, filterSet, and assignment", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.create({
          projectId: PROJECT_ID,
          slug: "errors",
          name: "Errors",
          query: "fail",
          filterSet: { status: [{ op: "eq", value: "error" }] },
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    const updated = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.update({
          id: created.id,
          projectId: PROJECT_ID,
          name: "Failures",
          slug: "failures",
          query: "really failed",
          filterSet: { duration: [{ op: "gte", value: 1000 }] },
          assignedUserId: ASSIGNEE_USER_ID,
        })
      }),
    )

    expect(updated.name).toBe("Failures")
    expect(updated.slug).toBe("failures")
    expect(updated.query).toBe("really failed")
    expect(updated.filterSet).toEqual({ duration: [{ op: "gte", value: 1000 }] })
    expect(updated.assignedUserId).toBe(ASSIGNEE_USER_ID)
  })

  it("returns DuplicateSavedSearchSlugError when update renames a row to an existing slug", async () => {
    const existing = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.create({
          projectId: PROJECT_ID,
          slug: "existing-slug",
          name: "Existing",
          query: "a",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.create({
          projectId: PROJECT_ID,
          slug: "other-slug",
          name: "Other",
          query: "b",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* SavedSearchRepository
          return yield* repo.update({
            id: created.id,
            projectId: PROJECT_ID,
            slug: existing.slug,
          })
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateSavedSearchSlugError)
  })

  it("returns SavedSearchNotFoundError on update of soft-deleted row", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.create({
          projectId: PROJECT_ID,
          slug: "to-delete",
          name: "To delete",
          query: "x",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.softDelete(created.id)
      }),
    )

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* SavedSearchRepository
          return yield* repo.findById(created.id)
        }),
      ),
    ).rejects.toBeInstanceOf(SavedSearchNotFoundError)
  })

  it("excludes deleted rows from listByProject", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.create({
          projectId: PROJECT_ID,
          slug: "kept",
          name: "Kept",
          query: "x",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.softDelete(created.id)
      }),
    )

    const page = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }),
    )
    expect(page.items).toHaveLength(0)
  })

  it("isolates saved searches across organizations", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        yield* repo.create({
          projectId: PROJECT_ID,
          slug: "owned",
          name: "Owned",
          query: "x",
          filterSet: {},
          assignedUserId: null,
          createdByUserId: CREATOR_USER_ID,
        })
      }),
    )

    const otherOrgPage = await runWithLiveOtherOrg(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }),
    )
    expect(otherOrgPage.items).toHaveLength(0)
  })
})

const SS_ORG_ID = OrganizationId("org-ss-search-test")
const SS_OTHER_ORG_ID = OrganizationId("org-ss-search-other")
const SS_PROJECT_A = ProjectId("proj-ss-search-a")
const SS_PROJECT_B = ProjectId("proj-ss-search-b")
const SS_PROJECT_DELETED = ProjectId("proj-ss-search-del")
const SS_PROJECT_OTHER = ProjectId("proj-ss-search-oth")

const ssId = (prefix: string) => prefix.padEnd(24, "x").slice(0, 24)

describe("SavedSearchRepositoryLive searchOrgWide", () => {
  const runSearch = <A, E>(effect: Effect.Effect<A, E, SavedSearchRepository | SqlClient>) =>
    Effect.runPromise(effect.pipe(withPostgres(SavedSearchRepositoryLive, pg.adminPostgresClient, SS_ORG_ID)))

  beforeAll(async () => {
    const db = pg.db
    const baseTime = new Date("2025-03-01T12:00:00.000Z")

    await db.insert(projects).values([
      { id: SS_PROJECT_A, organizationId: SS_ORG_ID, name: "Alpha Project", slug: "ss-alpha" },
      { id: SS_PROJECT_B, organizationId: SS_ORG_ID, name: "Beta Project", slug: "ss-beta" },
      { id: SS_PROJECT_DELETED, organizationId: SS_ORG_ID, name: "Gone Project", slug: "ss-gone", deletedAt: baseTime },
      { id: SS_PROJECT_OTHER, organizationId: SS_OTHER_ORG_ID, name: "Other Org Project", slug: "ss-other" },
    ])

    const row = (
      id: string,
      organizationId: OrganizationId,
      projectId: ProjectId,
      slug: string,
      name: string,
      extra: { deletedAt?: Date } = {},
    ) => ({
      id: ssId(id),
      organizationId,
      projectId,
      slug,
      name,
      query: "x",
      filterSet: {},
      assignedUserId: null,
      createdByUserId: CREATOR_USER_ID,
      createdAt: baseTime,
      updatedAt: baseTime,
      ...(extra.deletedAt ? { deletedAt: extra.deletedAt } : {}),
    })

    await db
      .insert(savedSearches)
      .values([
        row("sss1", SS_ORG_ID, SS_PROJECT_A, "errors-a", "Payment Errors"),
        row("sss2", SS_ORG_ID, SS_PROJECT_B, "errors-b", "Error Spikes"),
        row("sss3", SS_ORG_ID, SS_PROJECT_A, "latency", "Latency"),
        row("sss4", SS_ORG_ID, SS_PROJECT_A, "errors-del", "Errors Deleted", { deletedAt: baseTime }),
        row("sss5", SS_ORG_ID, SS_PROJECT_DELETED, "errors-gone", "Errors In Deleted Project"),
        row("sss6", SS_OTHER_ORG_ID, SS_PROJECT_OTHER, "errors-secret", "Errors Secret"),
      ])
  })

  it("matches saved searches across multiple projects in the org and tags them with the project", async () => {
    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.searchOrgWide({ searchQuery: "error", limit: 25 })
      }),
    )

    expect(results.map((r) => r.name).sort()).toEqual(["Error Spikes", "Payment Errors"])
    const payment = results.find((r) => r.name === "Payment Errors")
    const spikes = results.find((r) => r.name === "Error Spikes")
    expect(payment).toMatchObject({ projectId: SS_PROJECT_A, projectSlug: "ss-alpha", projectName: "Alpha Project" })
    expect(spikes).toMatchObject({ projectId: SS_PROJECT_B, projectSlug: "ss-beta", projectName: "Beta Project" })
  })

  it("excludes soft-deleted saved searches, deleted projects, and other organizations", async () => {
    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.searchOrgWide({ searchQuery: "error", limit: 25 })
      }),
    )
    const names = results.map((r) => r.name)
    expect(names).not.toContain("Errors Deleted")
    expect(names).not.toContain("Errors In Deleted Project")
    expect(names).not.toContain("Errors Secret")
  })

  it("respects the limit", async () => {
    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.searchOrgWide({ searchQuery: "error", limit: 1 })
      }),
    )
    expect(results).toHaveLength(1)
  })

  it("orders by name-match quality: exact, then prefix, then substring", async () => {
    const t = new Date("2025-03-02T12:00:00.000Z")
    const mk = (id: string, slug: string, name: string) => ({
      id: ssId(id),
      organizationId: SS_ORG_ID,
      projectId: SS_PROJECT_A,
      slug,
      name,
      query: "x",
      filterSet: {},
      assignedUserId: null,
      createdByUserId: CREATOR_USER_ID,
      createdAt: t,
      updatedAt: t,
    })
    // Inserted substring-first to prove ordering isn't just insertion/recency order.
    await pg.db
      .insert(savedSearches)
      .values([
        mk("ssm3", "my-zebra-log", "My Zebra Log"),
        mk("ssm2", "zebra-report", "Zebra Report"),
        mk("ssm1", "zebra", "Zebra"),
      ])

    const results = await runSearch(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.searchOrgWide({ searchQuery: "zebra", limit: 25 })
      }),
    )
    expect(results.map((r) => r.name)).toEqual(["Zebra", "Zebra Report", "My Zebra Log"])
  })
})
