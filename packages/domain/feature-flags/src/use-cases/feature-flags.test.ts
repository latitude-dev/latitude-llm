import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { DuplicateFeatureFlagIdentifierError, FeatureFlagNotFoundError } from "../errors.ts"
import { FeatureFlagRepository } from "../ports/feature-flag-repository.ts"
import { createFakeFeatureFlagRepository } from "../testing/fake-feature-flag-repository.ts"
import { createFeatureFlagUseCase } from "./create-feature-flag.ts"
import { disableFeatureFlagForOrganizationUseCase } from "./disable-feature-flag-for-organization.ts"
import { enableFeatureFlagForOrganizationUseCase } from "./enable-feature-flag-for-organization.ts"
import { hasFeatureFlagUseCase } from "./has-feature-flag.ts"
import { listEnabledFeatureFlagsUseCase } from "./list-enabled-feature-flags.ts"
import { listFeatureFlagsUseCase } from "./list-feature-flags.ts"

const ORG_ID = OrganizationId("org-feature-flags-test".padEnd(24, "x").slice(0, 24))
const OTHER_ORG_ID = OrganizationId("org-feature-flags-oth".padEnd(24, "x").slice(0, 24))
const ADMIN_USER_ID = UserId("admin-feature-flags".padEnd(24, "x").slice(0, 24))

function makeLayer(organizationId = ORG_ID) {
  const { repository } = createFakeFeatureFlagRepository()
  return Layer.mergeAll(
    Layer.succeed(FeatureFlagRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )
}

describe("feature flag use cases", () => {
  it("creates and lists feature flags", async () => {
    const layer = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({
          identifier: "new-dashboard",
          name: "New dashboard",
          description: "Enables the new dashboard experience.",
        })
        return yield* listFeatureFlagsUseCase()
      }).pipe(Effect.provide(layer)),
    )

    expect(result.map((featureFlag) => featureFlag.identifier)).toEqual(["new-dashboard"])
    expect(result[0].name).toBe("New dashboard")
  })

  it("rejects duplicate feature flag identifiers", async () => {
    const layer = makeLayer()

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
          return yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(DuplicateFeatureFlagIdentifierError)
  })

  it("returns false for missing and disabled feature flags", async () => {
    const layer = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
        const missing = yield* hasFeatureFlagUseCase({ identifier: "unknown-flag" })
        const disabled = yield* hasFeatureFlagUseCase({ identifier: "new-dashboard" })
        const empty = yield* hasFeatureFlagUseCase({ identifier: "   " })
        return { missing, disabled, empty }
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ missing: false, disabled: false, empty: false })
  })

  it("enables and disables a feature flag for the current organization", async () => {
    const layer = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
        yield* enableFeatureFlagForOrganizationUseCase({
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        const enabled = yield* hasFeatureFlagUseCase({ identifier: "new-dashboard" })
        const list = yield* listEnabledFeatureFlagsUseCase()
        yield* disableFeatureFlagForOrganizationUseCase({ identifier: "new-dashboard" })
        const disabled = yield* hasFeatureFlagUseCase({ identifier: "new-dashboard" })

        return { enabled, list, disabled }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.enabled).toBe(true)
    expect(result.list.map((featureFlag) => featureFlag.identifier)).toEqual(["new-dashboard"])
    expect(result.disabled).toBe(false)
  })

  it("isolates enabled feature flags by organization", async () => {
    const { repository } = createFakeFeatureFlagRepository()
    const baseLayer = Layer.succeed(FeatureFlagRepository, repository)
    const orgLayer = Layer.mergeAll(
      baseLayer,
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    )
    const otherOrgLayer = Layer.mergeAll(
      baseLayer,
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: OTHER_ORG_ID })),
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
        yield* enableFeatureFlagForOrganizationUseCase({
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
      }).pipe(Effect.provide(orgLayer)),
    )

    await expect(
      Effect.runPromise(
        enableFeatureFlagForOrganizationUseCase({
          identifier: "missing-flag",
          enabledByAdminUserId: ADMIN_USER_ID,
        }).pipe(Effect.provide(orgLayer)),
      ),
    ).rejects.toBeInstanceOf(FeatureFlagNotFoundError)

    const otherOrgEnabled = await Effect.runPromise(
      hasFeatureFlagUseCase({ identifier: "new-dashboard" }).pipe(Effect.provide(otherOrgLayer)),
    )
    expect(otherOrgEnabled).toBe(false)
  })
})
