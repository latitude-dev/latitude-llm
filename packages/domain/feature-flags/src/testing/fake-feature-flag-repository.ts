import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { createFeatureFlag, createOrganizationFeatureFlag, type FeatureFlag } from "../entities/feature-flag.ts"
import type { FeatureFlagRepositoryShape } from "../ports/feature-flag-repository.ts"
import type { FeatureFlagId } from "../registry.ts"

export const createFakeFeatureFlagRepository = () => {
  const featureFlags = new Map<FeatureFlagId, FeatureFlag>()
  const organizationFeatureFlags = new Map<string, ReturnType<typeof createOrganizationFeatureFlag>>()

  const enabledKey = (organizationId: string, identifier: FeatureFlagId) => `${organizationId}:${identifier}`

  const repository: FeatureFlagRepositoryShape = {
    listEnabledForOrganization: () =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const enabledIdentifiers = new Set(
          [...organizationFeatureFlags.values()]
            .filter((row) => row.organizationId === organizationId)
            .map((row) => row.identifier),
        )

        // Match the live repo: collect flags that are either globally enabled
        // or per-org enabled, synthesising a catalog row when only the
        // per-org side exists.
        const result = new Map<FeatureFlagId, FeatureFlag>()
        for (const flag of featureFlags.values()) {
          if (flag.enabledForAll || enabledIdentifiers.has(flag.identifier)) {
            result.set(flag.identifier, flag)
          }
        }
        for (const identifier of enabledIdentifiers) {
          if (result.has(identifier)) continue
          result.set(identifier, createFeatureFlag({ identifier }))
        }
        return [...result.values()].sort((a, b) => a.identifier.localeCompare(b.identifier))
      }),

    isEnabledForOrganization: (identifier) =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const flag = featureFlags.get(identifier)
        if (flag?.enabledForAll) return true
        return organizationFeatureFlags.has(enabledKey(organizationId, identifier))
      }),

    enableForOrganization: (input) =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const key = enabledKey(organizationId, input.identifier)
        const existing = organizationFeatureFlags.get(key)
        if (existing) return existing

        const organizationFeatureFlag = createOrganizationFeatureFlag({
          organizationId,
          identifier: input.identifier,
          enabledByAdminUserId: input.enabledByAdminUserId,
        })
        organizationFeatureFlags.set(key, organizationFeatureFlag)
        return organizationFeatureFlag
      }),

    disableForOrganization: (identifier) =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        organizationFeatureFlags.delete(enabledKey(organizationId, identifier))
      }),
  }

  return {
    repository,
    featureFlags,
    organizationFeatureFlags,
  }
}
