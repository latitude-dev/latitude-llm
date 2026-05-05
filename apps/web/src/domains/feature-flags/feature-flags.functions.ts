import { FeatureFlagRepository, hasFeatureFlagUseCase } from "@domain/feature-flags"
import { FeatureFlagRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

export const hasFeatureFlagInputSchema = z.object({
  identifier: z.string(),
})

export const hasFeatureFlag = createServerFn({ method: "GET" })
  .inputValidator(hasFeatureFlagInputSchema)
  .handler(async ({ data }): Promise<boolean> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return await Effect.runPromise(
      hasFeatureFlagUseCase({ identifier: data.identifier }).pipe(
        withPostgres(FeatureFlagRepositoryLive, client, organizationId),
        withTracing,
      ),
    )
  })

export const listEnabledFeatureFlagIdentifiers = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
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
