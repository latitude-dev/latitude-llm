import { ApiKeyRepository } from "@domain/api-keys"
import { ApiKeyRepositoryLive, type PostgresClient, withPostgres } from "@platform/db-postgres"
import { parseEnvOptional } from "@platform/env"
import { createLogger } from "@repo/observability"
import { hash } from "@repo/utils"
import { Effect } from "effect"

const logger = createLogger("dogfood-organization")

const organizationIdByTokenHash = new Map<string, string>()

/**
 * The organization this deployment dogfoods into: the one behind
 * `LAT_LATITUDE_TELEMETRY_API_KEY`, which is where every `latitude-*` telemetry
 * project lives. `null` when the deployment does not dogfood (self-hosted, local
 * dev, CI) or the credential no longer resolves to a key.
 *
 * The credential is the only permitted source. Resolving a `latitude-*` project
 * by slug across organizations instead could match a customer project of the same
 * name and write into it.
 */
export const resolveDogfoodOrganizationId = (adminPostgresClient: PostgresClient): Effect.Effect<string | null> =>
  Effect.gen(function* () {
    const apiKey = yield* parseEnvOptional("LAT_LATITUDE_TELEMETRY_API_KEY", "string")
    if (!apiKey) return null

    const tokenHash = yield* hash(apiKey)
    const memoized = organizationIdByTokenHash.get(tokenHash)
    if (memoized !== undefined) return memoized

    const apiKeyRepository = yield* ApiKeyRepository
    const key = yield* apiKeyRepository.findByTokenHash(tokenHash)
    organizationIdByTokenHash.set(tokenHash, key.organizationId)
    return key.organizationId
  }).pipe(
    // Cross-organization lookup: the key names its own tenant, so it runs on the
    // admin client with no organization scope to resolve.
    withPostgres(ApiKeyRepositoryLive, adminPostgresClient),
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("Could not resolve the dogfood organization; skipping the dogfood write", { error })
        return null
      }),
    ),
  )
