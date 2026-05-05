import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { createFeatureFlag, createOrganizationFeatureFlag } from "../entities/feature-flag.ts"
import { DuplicateFeatureFlagIdentifierError, FeatureFlagNotFoundError } from "../errors.ts"
import type { FeatureFlagRepositoryShape } from "../ports/feature-flag-repository.ts"

export const createFakeFeatureFlagRepository = () => {
  const featureFlags = new Map<string, ReturnType<typeof createFeatureFlag>>()
  const organizationFeatureFlags = new Map<string, ReturnType<typeof createOrganizationFeatureFlag>>()

  const enabledKey = (organizationId: string, featureFlagId: string) => `${organizationId}:${featureFlagId}`

  const repository: FeatureFlagRepositoryShape = {
    findByIdentifier: (identifier) =>
      Effect.gen(function* () {
        const featureFlag = featureFlags.get(identifier)
        if (!featureFlag) return yield* new FeatureFlagNotFoundError({ identifier })
        return featureFlag
      }),

    list: () => Effect.succeed([...featureFlags.values()]),

    listEnabledForOrganization: () =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const enabledFeatureFlagIds = new Set(
          [...organizationFeatureFlags.values()]
            .filter((row) => row.organizationId === organizationId)
            .map((row) => row.featureFlagId),
        )

        return [...featureFlags.values()].filter((featureFlag) => enabledFeatureFlagIds.has(featureFlag.id))
      }),

    isEnabledForOrganization: (identifier) =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const featureFlag = featureFlags.get(identifier)
        if (!featureFlag) return false

        return organizationFeatureFlags.has(enabledKey(organizationId, featureFlag.id))
      }),

    createFeatureFlag: (input) =>
      Effect.gen(function* () {
        if (featureFlags.has(input.identifier)) {
          return yield* new DuplicateFeatureFlagIdentifierError({ identifier: input.identifier })
        }

        const featureFlag = createFeatureFlag(input)
        featureFlags.set(featureFlag.identifier, featureFlag)
        return featureFlag
      }),

    enableForOrganization: (input) =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const featureFlag = featureFlags.get(input.identifier)
        if (!featureFlag) return yield* new FeatureFlagNotFoundError({ identifier: input.identifier })

        const key = enabledKey(organizationId, featureFlag.id)
        const existing = organizationFeatureFlags.get(key)
        if (existing) return existing

        const organizationFeatureFlag = createOrganizationFeatureFlag({
          organizationId,
          featureFlagId: featureFlag.id,
          enabledByAdminUserId: input.enabledByAdminUserId,
        })
        organizationFeatureFlags.set(key, organizationFeatureFlag)
        return organizationFeatureFlag
      }),

    disableForOrganization: (identifier) =>
      Effect.gen(function* () {
        const { organizationId } = yield* SqlClient
        const featureFlag = featureFlags.get(identifier)
        if (!featureFlag) return

        organizationFeatureFlags.delete(enabledKey(organizationId, featureFlag.id))
      }),
  }

  return {
    repository,
    featureFlags,
    organizationFeatureFlags,
  }
}
