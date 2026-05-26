import { AdminFeatureFlagRepository } from "@domain/admin"
import { FEATURE_FLAG_IDS, FEATURE_FLAGS } from "@domain/feature-flags"
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

  it("lists every registry flag, hydrating name/description from code", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        return yield* repo.list()
      }),
    )

    expect(result.map((flag) => flag.identifier).sort()).toEqual([...FEATURE_FLAG_IDS].sort())
    for (const flag of result) {
      expect(flag.name).toBe(FEATURE_FLAGS[flag.identifier].name)
      expect(flag.description).toBe(FEATURE_FLAGS[flag.identifier].description)
      expect(flag.enabledForAll).toBe(false)
      expect(flag.enabledOrganizations).toEqual([])
    }
  })

  it("hydrates enabled organizations for each flag", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        return yield* repo.list()
      }),
    )

    const slack = result.find((flag) => flag.identifier === "slack")
    expect(slack?.enabledOrganizations).toEqual([{ id: ORG_ID, name: "Acme", slug: "acme" }])
  })

  it("splits flags into enabled and available for an organization", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        return yield* repo.listForOrganization(ORG_ID)
      }),
    )

    expect(result.enabled.map((flag) => flag.identifier)).toEqual(["slack"])
    expect(result.available.map((flag) => flag.identifier)).not.toContain("slack")
    expect(result.enabled.length + result.available.length).toBe(FEATURE_FLAG_IDS.length)
  })

  it("includes globally enabled flags in the enabled bucket for every org", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.enableForAll("slack")
        const owner = yield* repo.listForOrganization(ORG_ID)
        const other = yield* repo.listForOrganization(OTHER_ORG_ID)
        return { owner, other }
      }),
    )

    expect(result.owner.enabled.map((flag) => flag.identifier)).toContain("slack")
    expect(result.other.enabled.map((flag) => flag.identifier)).toContain("slack")
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

  it("findEligibilityForFlag returns explicitly enabled organizations", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        return yield* repo.findEligibilityForFlag("slack")
      }),
    )

    expect(result.enabledForAll).toBe(false)
    expect(result.organizationIds).toEqual([ORG_ID])
  })

  it("findEligibilityForFlag short-circuits when enabledForAll=true", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.enableForAll("slack")
        return yield* repo.findEligibilityForFlag("slack")
      }),
    )

    expect(result.enabledForAll).toBe(true)
    expect(result.organizationIds).toEqual([])
  })

  it("findEligibilityForFlag returns an empty disabled result when no DB row exists", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        return yield* repo.findEligibilityForFlag("slack")
      }),
    )

    expect(result.enabledForAll).toBe(false)
    expect(result.organizationIds).toEqual([])
  })

  it("enableForAll upserts the catalog row, disableForAll flips it back", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.enableForAll("slack")
        const afterEnable = yield* repo.list()
        yield* repo.disableForAll("slack")
        const afterDisable = yield* repo.list()
        return { afterEnable, afterDisable }
      }),
    )

    const enabledSlack = result.afterEnable.find((flag) => flag.identifier === "slack")
    const disabledSlack = result.afterDisable.find((flag) => flag.identifier === "slack")
    expect(enabledSlack?.enabledForAll).toBe(true)
    expect(disabledSlack?.enabledForAll).toBe(false)
  })

  it("per-org enable is idempotent; disable for a missing row is a silent no-op", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminFeatureFlagRepository
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        yield* repo.enableForOrganization({
          organizationId: ORG_ID,
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
      }),
    )

    const rows = await pg.db.select().from(organizationFeatureFlags)
    expect(rows).toHaveLength(1)

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminFeatureFlagRepository
          yield* repo.disableForOrganization({ organizationId: OTHER_ORG_ID, identifier: "slack" })
        }),
      ),
    ).resolves.toBeUndefined()
  })
})
