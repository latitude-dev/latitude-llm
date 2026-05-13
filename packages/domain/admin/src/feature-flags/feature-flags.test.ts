import { DuplicateFeatureFlagIdentifierError, FeatureFlagNotFoundError } from "@domain/feature-flags"
import { NotFoundError, OrganizationId, UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { archiveFeatureFlagUseCase } from "./archive-feature-flag.ts"
import { createFeatureFlagUseCase } from "./create-feature-flag.ts"
import { deleteFeatureFlagUseCase } from "./delete-feature-flag.ts"
import { disableFeatureFlagForAllUseCase } from "./disable-feature-flag-for-all.ts"
import { disableFeatureFlagForOrganizationUseCase } from "./disable-feature-flag-for-organization.ts"
import { enableFeatureFlagForAllUseCase } from "./enable-feature-flag-for-all.ts"
import { enableFeatureFlagForOrganizationUseCase } from "./enable-feature-flag-for-organization.ts"
import { AdminFeatureFlagRepository, type AdminFeatureFlagRepositoryShape } from "./feature-flag-repository.ts"
import type { AdminFeatureFlagSummary, AdminOrganizationFeatureFlags } from "./feature-flag-result.ts"
import { listArchivedFeatureFlagsUseCase } from "./list-archived-feature-flags.ts"
import { listFeatureFlagsUseCase } from "./list-feature-flags.ts"
import { listOrganizationFeatureFlagsUseCase } from "./list-organization-feature-flags.ts"
import { unarchiveFeatureFlagUseCase } from "./unarchive-feature-flag.ts"
import { updateFeatureFlagUseCase } from "./update-feature-flag.ts"

const ORG_ID = OrganizationId("org-admin-ff".padEnd(24, "x").slice(0, 24))
const ADMIN_USER_ID = UserId("user-admin-ff".padEnd(24, "x").slice(0, 24))

function makeFeatureFlag(identifier: string): AdminFeatureFlagSummary {
  const now = new Date("2026-01-01T00:00:00.000Z")
  return {
    id: `${identifier}-id`.padEnd(24, "x").slice(0, 24) as AdminFeatureFlagSummary["id"],
    identifier,
    name: null,
    description: null,
    enabledForAll: false,
    enabledOrganizations: [],
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

function makeLayer() {
  const active = new Map<string, AdminFeatureFlagSummary>()
  const archived = new Map<string, AdminFeatureFlagSummary>()
  const enabledByOrg = new Map<string, Set<string>>()

  const repository: AdminFeatureFlagRepositoryShape = {
    list: () => Effect.succeed([...active.values()]),
    listArchived: () => Effect.succeed([...archived.values()]),
    findEligibilityForFlag: (identifier) =>
      Effect.gen(function* () {
        const flag = active.get(identifier)
        if (!flag) return yield* new FeatureFlagNotFoundError({ identifier })
        if (flag.enabledForAll) return { enabledForAll: true, organizationIds: [] }
        const orgIds: OrganizationId[] = []
        for (const [orgId, set] of enabledByOrg.entries()) {
          if (set.has(identifier)) orgIds.push(OrganizationId(orgId))
        }
        return { enabledForAll: false, organizationIds: orgIds }
      }),
    create: (input) =>
      Effect.gen(function* () {
        if (active.has(input.identifier) || archived.has(input.identifier)) {
          return yield* new DuplicateFeatureFlagIdentifierError({ identifier: input.identifier })
        }
        const flag = {
          ...makeFeatureFlag(input.identifier),
          name: input.name ?? null,
          description: input.description ?? null,
        }
        active.set(input.identifier, flag)
        return flag
      }),
    update: (input) =>
      Effect.gen(function* () {
        const flag = active.get(input.identifier) ?? archived.get(input.identifier)
        if (!flag) return yield* new FeatureFlagNotFoundError({ identifier: input.identifier })
        const updated = {
          ...flag,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        }
        if (active.has(input.identifier)) active.set(input.identifier, updated)
        else archived.set(input.identifier, updated)
        return updated
      }),
    archive: (identifier) =>
      Effect.gen(function* () {
        const flag = active.get(identifier)
        if (!flag) return yield* new FeatureFlagNotFoundError({ identifier })
        active.delete(identifier)
        archived.set(identifier, { ...flag, archivedAt: new Date() })
      }),
    unarchive: (identifier) =>
      Effect.gen(function* () {
        const flag = archived.get(identifier)
        if (!flag) return yield* new FeatureFlagNotFoundError({ identifier })
        archived.delete(identifier)
        active.set(identifier, { ...flag, archivedAt: null })
      }),
    delete: (identifier) =>
      Effect.sync(() => {
        active.delete(identifier)
        archived.delete(identifier)
        for (const set of enabledByOrg.values()) set.delete(identifier)
      }),
    enableForAll: (identifier) =>
      Effect.gen(function* () {
        const flag = active.get(identifier)
        if (!flag) return yield* new FeatureFlagNotFoundError({ identifier })
        active.set(identifier, { ...flag, enabledForAll: true })
      }),
    disableForAll: (identifier) =>
      Effect.gen(function* () {
        const flag = active.get(identifier)
        if (!flag) return yield* new FeatureFlagNotFoundError({ identifier })
        active.set(identifier, { ...flag, enabledForAll: false })
      }),
    listForOrganization: (organizationId) =>
      Effect.gen(function* () {
        if (organizationId !== ORG_ID) {
          return yield* new NotFoundError({ entity: "Organization", id: organizationId })
        }
        const enabledIdentifiers = enabledByOrg.get(organizationId) ?? new Set<string>()
        const all = [...active.values()]
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
        if (!active.has(input.identifier)) return yield* new FeatureFlagNotFoundError({ identifier: input.identifier })
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

  it("updates a feature flag's name and description", async () => {
    const layer = makeLayer()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "new-dashboard", name: "Old name" })
        const updated = yield* updateFeatureFlagUseCase({
          identifier: "new-dashboard",
          name: "New name",
          description: "A description.",
        })
        return updated
      }).pipe(Effect.provide(layer)),
    )

    expect(result.name).toBe("New name")
    expect(result.description).toBe("A description.")
  })

  it("flips enable-for-all on and off", async () => {
    const layer = makeLayer()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "global-flag" })
        yield* enableFeatureFlagForAllUseCase({ identifier: "global-flag" })
        const enabled = (yield* listFeatureFlagsUseCase()).map((flag) => flag.enabledForAll)
        yield* disableFeatureFlagForAllUseCase({ identifier: "global-flag" })
        const disabled = (yield* listFeatureFlagsUseCase()).map((flag) => flag.enabledForAll)
        return { enabled, disabled }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.enabled).toEqual([true])
    expect(result.disabled).toEqual([false])
  })

  it("archives, lists archived, unarchives, and deletes flags", async () => {
    const layer = makeLayer()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createFeatureFlagUseCase({ identifier: "doomed" })
        yield* archiveFeatureFlagUseCase({ identifier: "doomed" })
        const archivedAfterArchive = yield* listArchivedFeatureFlagsUseCase()

        yield* unarchiveFeatureFlagUseCase({ identifier: "doomed" })
        const activeAfterUnarchive = yield* listFeatureFlagsUseCase()
        const archivedAfterUnarchive = yield* listArchivedFeatureFlagsUseCase()

        yield* archiveFeatureFlagUseCase({ identifier: "doomed" })
        yield* deleteFeatureFlagUseCase({ identifier: "doomed" })
        const archivedAfterDelete = yield* listArchivedFeatureFlagsUseCase()
        const activeAfterDelete = yield* listFeatureFlagsUseCase()

        return {
          archivedAfterArchive: archivedAfterArchive.map((f) => f.identifier),
          activeAfterUnarchive: activeAfterUnarchive.map((f) => f.identifier),
          archivedAfterUnarchive: archivedAfterUnarchive.map((f) => f.identifier),
          archivedAfterDelete: archivedAfterDelete.map((f) => f.identifier),
          activeAfterDelete: activeAfterDelete.map((f) => f.identifier),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.archivedAfterArchive).toEqual(["doomed"])
    expect(result.activeAfterUnarchive).toEqual(["doomed"])
    expect(result.archivedAfterUnarchive).toEqual([])
    expect(result.archivedAfterDelete).toEqual([])
    expect(result.activeAfterDelete).toEqual([])
  })
})
