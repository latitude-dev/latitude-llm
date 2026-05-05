import { DuplicateFeatureFlagIdentifierError, FeatureFlagNotFoundError } from "@domain/feature-flags"
import { NotFoundError, OrganizationId, UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { archiveFeatureFlagUseCase } from "./archive-feature-flag.ts"
import { createFeatureFlagUseCase } from "./create-feature-flag.ts"
import { disableFeatureFlagForOrganizationUseCase } from "./disable-feature-flag-for-organization.ts"
import { enableFeatureFlagForOrganizationUseCase } from "./enable-feature-flag-for-organization.ts"
import { AdminFeatureFlagRepository, type AdminFeatureFlagRepositoryShape } from "./feature-flag-repository.ts"
import type { AdminFeatureFlagSummary, AdminOrganizationFeatureFlags } from "./feature-flag-result.ts"
import { listFeatureFlagsUseCase } from "./list-feature-flags.ts"
import { listOrganizationFeatureFlagsUseCase } from "./list-organization-feature-flags.ts"

const ORG_ID = OrganizationId("org-admin-ff".padEnd(24, "x").slice(0, 24))
const ADMIN_USER_ID = UserId("user-admin-ff".padEnd(24, "x").slice(0, 24))

function makeFeatureFlag(identifier: string): AdminFeatureFlagSummary {
  const now = new Date("2026-01-01T00:00:00.000Z")
  return {
    id: `${identifier}-id`.padEnd(24, "x").slice(0, 24) as AdminFeatureFlagSummary["id"],
    identifier,
    name: null,
    description: null,
    enabledOrganizations: [],
    createdAt: now,
    updatedAt: now,
  }
}

function makeLayer() {
  const flags = new Map<string, AdminFeatureFlagSummary>()
  const enabledByOrg = new Map<string, Set<string>>()

  const repository: AdminFeatureFlagRepositoryShape = {
    list: () => Effect.succeed([...flags.values()]),
    create: (input) =>
      Effect.gen(function* () {
        if (flags.has(input.identifier)) {
          return yield* new DuplicateFeatureFlagIdentifierError({ identifier: input.identifier })
        }
        const flag = {
          ...makeFeatureFlag(input.identifier),
          name: input.name ?? null,
          description: input.description ?? null,
        }
        flags.set(input.identifier, flag)
        return flag
      }),
    archive: (identifier) =>
      Effect.gen(function* () {
        if (!flags.delete(identifier)) return yield* new FeatureFlagNotFoundError({ identifier })
      }),
    listForOrganization: (organizationId) =>
      Effect.gen(function* () {
        if (organizationId !== ORG_ID) {
          return yield* new NotFoundError({ entity: "Organization", id: organizationId })
        }
        const enabledIdentifiers = enabledByOrg.get(organizationId) ?? new Set<string>()
        const all = [...flags.values()]
        const enabled = all
          .filter((flag) => enabledIdentifiers.has(flag.identifier))
          .map(({ enabledOrganizations, ...flag }) => flag)
        const available = all
          .filter((flag) => !enabledIdentifiers.has(flag.identifier))
          .map(({ enabledOrganizations, ...flag }) => flag)
        return { enabled, available } satisfies AdminOrganizationFeatureFlags
      }),
    enableForOrganization: (input) =>
      Effect.gen(function* () {
        if (input.organizationId !== ORG_ID) {
          return yield* new NotFoundError({ entity: "Organization", id: input.organizationId })
        }
        if (!flags.has(input.identifier)) return yield* new FeatureFlagNotFoundError({ identifier: input.identifier })
        const set = enabledByOrg.get(input.organizationId) ?? new Set<string>()
        set.add(input.identifier)
        enabledByOrg.set(input.organizationId, set)
      }),
    disableForOrganization: (input) =>
      Effect.sync(() => {
        enabledByOrg.get(input.organizationId)?.delete(input.identifier)
      }),
  }

  return Layer.succeed(AdminFeatureFlagRepository, repository)
}

describe("admin feature flag use cases", () => {
  it("creates and lists feature flags", async () => {
    const layer = makeLayer()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({
          identifier: "new-dashboard",
          name: "New dashboard",
          description: "Rolls out the new dashboard.",
        })
        return yield* listFeatureFlagsUseCase()
      }).pipe(Effect.provide(layer)),
    )

    expect(result.map((flag) => flag.identifier)).toEqual(["new-dashboard"])
    expect(result[0].name).toBe("New dashboard")
  })

  it("rejects duplicate feature flag identifiers", async () => {
    const layer = makeLayer()

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
          yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(DuplicateFeatureFlagIdentifierError)
  })

  it("enables and disables feature flags for an organization", async () => {
    const layer = makeLayer()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
        yield* enableFeatureFlagForOrganizationUseCase({
          organizationId: ORG_ID,
          identifier: "new-dashboard",
          enabledByAdminUserId: ADMIN_USER_ID,
        })
        const enabled = yield* listOrganizationFeatureFlagsUseCase({ organizationId: ORG_ID })
        yield* disableFeatureFlagForOrganizationUseCase({ organizationId: ORG_ID, identifier: "new-dashboard" })
        const disabled = yield* listOrganizationFeatureFlagsUseCase({ organizationId: ORG_ID })
        return { enabled, disabled }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.enabled.enabled.map((flag) => flag.identifier)).toEqual(["new-dashboard"])
    expect(result.enabled.available).toHaveLength(0)
    expect(result.disabled.enabled).toHaveLength(0)
    expect(result.disabled.available.map((flag) => flag.identifier)).toEqual(["new-dashboard"])
  })

  it("archives feature flags", async () => {
    const layer = makeLayer()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "new-dashboard" })
        yield* archiveFeatureFlagUseCase({ identifier: "new-dashboard" })
        return yield* listFeatureFlagsUseCase()
      }).pipe(Effect.provide(layer)),
    )

    expect(result).toHaveLength(0)
  })
})
