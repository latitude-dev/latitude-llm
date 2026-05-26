import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { createFeatureFlag, createOrganizationFeatureFlag } from "../entities/feature-flag.ts"
import type { FeatureFlagRepositoryShape } from "../ports/feature-flag-repository.ts"
import type { FeatureFlagId } from "../registry.ts"

export const createFakeFeatureFlagRepository = () => {
  const featureFlags = new Map<FeatureFlagId, ReturnType<typeof createFeatureFlag>>()
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
        return [...featureFlags.values()].filter(
          (flag) => flag.enabledForAll || enabledIdentifiers.has(flag.identifier),
        )
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
