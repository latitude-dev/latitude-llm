import { type FeatureFlagId, FeatureFlagRepository } from "@domain/feature-flags"
import { FeatureFlagRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

export const listEnabledFeatureFlagIdentifiers = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeatureFlagId[]> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const featureFlags = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* FeatureFlagRepository
        return yield* repo.listEnabledForOrganization()
      }).pipe(withPostgres(FeatureFlagRepositoryLive, client, organizationId), withTracing),
    )

    return featureFlags.map((featureFlag) => featureFlag.identifier)
  },
)
