import { AdminFeatureFlagRepository } from "@domain/admin"
import { DuplicateFeatureFlagIdentifierError, FeatureFlagNotFoundError } from "@domain/feature-flags"
import { NotFoundError, OrganizationId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { organizations, users } from "../schema/better-auth.ts"
import { featureFlags, organizationFeatureFlags } from "../schema/feature-flags.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AdminFeatureFlagRepositoryLive } from "./admin-feature-flag-repository.ts"

const pg = setupTestPostgres()

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG_ID = OrganizationId(makeId("org-admin-ff"))
const OTHER_ORG_ID = OrganizationId(makeId("org-admin-ff-other"))
const ADMIN_USER_ID = UserId(makeId("user-admin-ff"))

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AdminFeatureFlagRepository>) =>
  Effect.runPromise(effect.pipe(withPostgres(AdminFeatureFlagRepositoryLive, pg.adminPostgresClient)))

describe("AdminFeatureFlagRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(organizationFeatureFlags)
    await pg.db.delete(featureFlags)
    await pg.db.delete(organizations)
    await pg.db.delete(users)

    const now = new Date("2026-01-01T00:00:00.000Z")
    await pg.db.insert(users).values({
      id: ADMIN_USER_ID,
      name: "Admin User",
      email: "admin@example.com",
      emailVerified: true,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    })
    await pg.db.insert(organizations).values([
      { id: ORG_ID, name: "Acme", slug: "acme", createdAt: now, updatedAt: now },
      { id: OTHER_ORG_ID, name: "Beta", slug: "beta", createdAt: now, updatedAt: now },
    ])
  })

  it("creates and lists active feature flags with enabled organizations", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({
          identifier: "new-dashboard",
          name: "New dashboard",
          description: "Rolls out the new dashboard.",
        })
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        return yield* repo.list()
      }),
    )

    expect(result).toHaveLength(1)
    expect(result[0].identifier).toBe("new-dashboard")
    expect(result[0].enabledOrganizations).toEqual([{ id: ORG_ID, name: "Acme", slug: "acme" }])
  })

  it("rejects duplicate identifiers", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({ identifier: "new-dashboard" })
      }),
    )

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminFeatureFlagRepository
          return yield* repo.create({ identifier: "new-dashboard" })
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateFeatureFlagIdentifierError)
  })

  it("lists enabled and available flags for an organization", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({ identifier: "new-dashboard" })
        yield* repo.create({ identifier: "beta-tools" })
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        return yield* repo.listForOrganization(ORG_ID)
      }),
    )

    expect(result.enabled.map((flag) => flag.identifier)).toEqual(["new-dashboard"])
    expect(result.available.map((flag) => flag.identifier)).toEqual(["beta-tools"])
  })

  it("archives flags so they disappear from lists and organization enablements", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({ identifier: "new-dashboard" })
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        yield* repo.archive("new-dashboard")
        const list = yield* repo.list()
        const orgFlags = yield* repo.listForOrganization(ORG_ID)
        return { list, orgFlags }
      }),
    )

    expect(result.list).toHaveLength(0)
    expect(result.orgFlags.enabled).toHaveLength(0)
    expect(result.orgFlags.available).toHaveLength(0)
  })

  it("treats archived flags like missing when enabling", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminFeatureFlagRepository
          yield* repo.create({ identifier: "new-dashboard" })
          yield* repo.archive("new-dashboard")
          yield* repo.enableForOrganization({
            organizationId: ORG_ID,
            identifier: "new-dashboard",
            enabledByAdminUserId: ADMIN_USER_ID,
          })
        }),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagNotFoundError)
  })

  it("returns NotFoundError for missing organizations", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminFeatureFlagRepository
          return yield* repo.listForOrganization(OrganizationId(makeId("org-missing")))
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("updates name and description without touching identifier", async () => {
    const updated = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({ identifier: "new-dashboard", name: "Old", description: "Old desc." })
        return yield* repo.update({ identifier: "new-dashboard", name: "New", description: "New desc." })
      }),
    )

    expect(updated.identifier).toBe("new-dashboard")
    expect(updated.name).toBe("New")
    expect(updated.description).toBe("New desc.")
  })

  it("toggles enable-for-all on the flag", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({ identifier: "global-flag" })
        yield* repo.enableForAll("global-flag")
        const afterEnable = yield* repo.list()
        yield* repo.disableForAll("global-flag")
        const afterDisable = yield* repo.list()
        return { afterEnable, afterDisable }
      }),
    )

    expect(result.afterEnable[0].enabledForAll).toBe(true)
    expect(result.afterDisable[0].enabledForAll).toBe(false)
  })

  it("lists archived flags via listArchived and unarchives them back", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({ identifier: "archived-flag" })
        yield* repo.archive("archived-flag")
        const archived = yield* repo.listArchived()
        const activeBefore = yield* repo.list()
        yield* repo.unarchive("archived-flag")
        const activeAfter = yield* repo.list()
        const archivedAfter = yield* repo.listArchived()
        return { archived, activeBefore, activeAfter, archivedAfter }
      }),
    )

    expect(result.archived.map((flag) => flag.identifier)).toEqual(["archived-flag"])
    expect(result.activeBefore).toHaveLength(0)
    expect(result.activeAfter.map((flag) => flag.identifier)).toEqual(["archived-flag"])
    expect(result.archivedAfter).toHaveLength(0)
  })

  it("delete drops the flag and its organization enablements", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.create({ identifier: "doomed" })
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "doomed",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        yield* repo.archive("doomed")
        yield* repo.delete("doomed")
        const list = yield* repo.list()
        const archived = yield* repo.listArchived()
        return { list, archived }
      }),
    )

    expect(result.list).toHaveLength(0)
    expect(result.archived).toHaveLength(0)
    const remainingEnablements = await pg.db.select().from(organizationFeatureFlags)
    expect(remainingEnablements).toHaveLength(0)
  })
})
