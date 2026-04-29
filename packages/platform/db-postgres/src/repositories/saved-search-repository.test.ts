import { DuplicateSavedSearchSlugError, SavedSearchNotFoundError, SavedSearchRepository } from "@domain/saved-searches"
import { OrganizationId, ProjectId, type SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
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
        return yield* repo.existsBySlug({ projectId: PROJECT_ID, slug: "errors" })
      }),
    )
    expect(collidesWithOther).toBe(true)

    const collidesWithSelfExcluded = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SavedSearchRepository
        return yield* repo.existsBySlug({
          projectId: PROJECT_ID,
          slug: "errors",
          excludeId: created.id,
        })
      }),
    )
    expect(collidesWithSelfExcluded).toBe(false)
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
