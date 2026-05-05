import {
  DuplicateFeatureFlagIdentifierError,
  FeatureFlagNotFoundError,
  FeatureFlagRepository,
} from "@domain/feature-flags"
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

  it("creates and finds a feature flag by identifier", async () => {
    const created = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.createFeatureFlag({
          identifier: "new-dashboard",
          name: "New dashboard",
          description: "Enables the new dashboard experience.",
        })
      }),
    )

    expect(created.identifier).toBe("new-dashboard")
    expect(created.name).toBe("New dashboard")

    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.findByIdentifier("new-dashboard")
      }),
    )
    expect(found.id).toBe(created.id)
  })

  it("rejects duplicate feature flag identifiers", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        yield* repo.createFeatureFlag({ identifier: "new-dashboard" })
      }),
    )

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* FeatureFlagRepository
          return yield* repo.createFeatureFlag({ identifier: "new-dashboard" })
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateFeatureFlagIdentifierError)
  })

  it("returns false for an unknown feature flag identifier", async () => {
    const enabled = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.isEnabledForOrganization("missing-flag")
      }),
    )

    expect(enabled).toBe(false)
  })

  it("enables, lists, and disables a feature flag for an organization", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        yield* repo.createFeatureFlag({ identifier: "new-dashboard" })
        const enabledRow = yield* repo.enableForOrganization({
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        const enabled = yield* repo.isEnabledForOrganization("new-dashboard")
        const list = yield* repo.listEnabledForOrganization()
        yield* repo.disableForOrganization("new-dashboard")
        const disabled = yield* repo.isEnabledForOrganization("new-dashboard")

        return { enabledRow, enabled, list, disabled }
      }),
    )

    expect(result.enabledRow.enabledByAdminUserId).toBe(ADMIN_USER_ID)
    expect(result.enabled).toBe(true)
    expect(result.list.map((featureFlag) => featureFlag.identifier)).toEqual(["new-dashboard"])
    expect(result.disabled).toBe(false)
  })

  it("keeps enablement idempotent", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        yield* repo.createFeatureFlag({ identifier: "new-dashboard" })
        const first = yield* repo.enableForOrganization({
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        const second = yield* repo.enableForOrganization({
          identifier: "new-dashboard",
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
        yield* repo.createFeatureFlag({ identifier: "new-dashboard" })
        yield* repo.enableForOrganization({
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
      }),
    )

    const otherOrgEnabled = await runWithLiveOtherOrg(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.isEnabledForOrganization("new-dashboard")
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

  it("fails when enabling an unknown feature flag", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* FeatureFlagRepository
          return yield* repo.enableForOrganization({
            identifier: "missing-flag",
            enabledByAdminUserId: ADMIN_USER_ID,
          })
        }),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagNotFoundError)
  })

  it("treats archived feature flags like missing flags", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        yield* repo.createFeatureFlag({ identifier: "new-dashboard" })
        yield* repo.enableForOrganization({
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        yield* repo.archiveFeatureFlag("new-dashboard")

        const enabled = yield* repo.isEnabledForOrganization("new-dashboard")
        const allFlags = yield* repo.list()
        const enabledFlags = yield* repo.listEnabledForOrganization()

        return { enabled, allFlags, enabledFlags }
      }),
    )

    expect(result.enabled).toBe(false)
    expect(result.allFlags).toHaveLength(0)
    expect(result.enabledFlags).toHaveLength(0)
  })
})
