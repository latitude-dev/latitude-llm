import { FeatureFlagRepository } from "@domain/feature-flags"
import { OrganizationId, type SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { featureFlags, organizationFeatureFlags } from "../schema/feature-flags.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { FeatureFlagRepositoryLive } from "./feature-flag-repository.ts"

const ORG_ID = OrganizationId("org-feature-flags-test".padEnd(24, "x").slice(0, 24))
const OTHER_ORG_ID = OrganizationId("org-feature-flags-oth".padEnd(24, "x").slice(0, 24))
const ADMIN_USER_ID = UserId("admin-feature-flags".padEnd(24, "x").slice(0, 24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, FeatureFlagRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(FeatureFlagRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const runWithLiveOtherOrg = <A, E>(effect: Effect.Effect<A, E, FeatureFlagRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(FeatureFlagRepositoryLive, pg.adminPostgresClient, OTHER_ORG_ID)))

describe("FeatureFlagRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(organizationFeatureFlags)
    await pg.db.delete(featureFlags)
  })

  it("returns false for a flag with no DB row at all", async () => {
    const enabled = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.isEnabledForOrganization("slack")
      }),
    )

    expect(enabled).toBe(false)
  })

  it("enables, lists, and disables a feature flag for an organization", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        const enabledRow = yield* repo.enableForOrganization({
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        const enabled = yield* repo.isEnabledForOrganization("slack")
        const list = yield* repo.listEnabledForOrganization()
        yield* repo.disableForOrganization("slack")
        const disabled = yield* repo.isEnabledForOrganization("slack")

        return { enabledRow, enabled, list, disabled }
      }),
    )

    expect(result.enabledRow.enabledByAdminUserId).toBe(ADMIN_USER_ID)
    expect(result.enabled).toBe(true)
    expect(result.list.map((featureFlag) => featureFlag.identifier)).toEqual(["slack"])
    expect(result.disabled).toBe(false)
  })

  it("keeps per-org enablement idempotent", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        const first = yield* repo.enableForOrganization({
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        const second = yield* repo.enableForOrganization({
          identifier: "slack",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        return { first, second }
      }),
    )

    expect(result.second.id).toBe(result.first.id)
  })

  it("isolates enabled flags by organization", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        yield* repo.enableForOrganization({ identifier: "slack", enabledByAdminUserId: ADMIN_USER_ID })
      }),
    )

    const otherOrgEnabled = await runWithLiveOtherOrg(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.isEnabledForOrganization("slack")
      }),
    )
    const otherOrgList = await runWithLiveOtherOrg(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.listEnabledForOrganization()
      }),
    )

    expect(otherOrgEnabled).toBe(false)
    expect(otherOrgList).toHaveLength(0)
  })

  it("treats globally enabled flags as enabled for any organization", async () => {
    await pg.db.insert(featureFlags).values({ identifier: "slack", enabledForAll: true })

    const result = await runWithLiveOtherOrg(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        const enabled = yield* repo.isEnabledForOrganization("slack")
        const list = yield* repo.listEnabledForOrganization()
        return { enabled, list }
      }),
    )

    expect(result.enabled).toBe(true)
    expect(result.list.map((flag) => flag.identifier)).toEqual(["slack"])
  })

  it("ignores DB rows for identifiers that are no longer in the code registry", async () => {
    // Simulate an orphaned row left behind after a flag is deleted from
    // FEATURE_FLAGS. listEnabledForOrganization must not crash trying to
    // parse the unknown identifier.
    await pg.db.insert(featureFlags).values({ identifier: "deleted-flag", enabledForAll: true })
    await pg.db
      .insert(organizationFeatureFlags)
      .values({ organizationId: ORG_ID, identifier: "deleted-flag", enabledByAdminUserId: ADMIN_USER_ID })

    const list = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.listEnabledForOrganization()
      }),
    )

    expect(list.map((flag) => flag.identifier)).not.toContain("deleted-flag")
  })

  it("disabling a flag that has no row is a silent no-op", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* FeatureFlagRepository
          yield* repo.disableForOrganization("slack")
        }),
      ),
    ).resolves.toBeUndefined()
  })
})
