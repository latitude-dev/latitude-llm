import { createApiKey } from "@domain/api-keys"
import { ApiKeyId } from "@domain/shared"
import { hashToken } from "@repo/utils"
import { Effect } from "effect"
import { SEED_ORG_ID } from "../organizations/index.ts"
import type { SeedContext, Seeder } from "../types.ts"

const SEED_API_KEY_ID = ApiKeyId("v42lqe92hgq2hpvilg91brnt")
const SEED_API_KEY_TOKEN = "lat_seed_default_api_key_token"
const SEED_API_KEY_NAME = "Default API Key"

const seedApiKeys: Seeder = {
  name: "api-keys/default-key",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const tokenHash = yield* Effect.tryPromise({
        try: () => hashToken(SEED_API_KEY_TOKEN),
        catch: (error) => (error instanceof Error ? error : new Error(`Failed to hash token: ${String(error)}`)),
      })
      const apiKey = createApiKey({
        id: SEED_API_KEY_ID,
        organizationId: SEED_ORG_ID,
        token: SEED_API_KEY_TOKEN,
        tokenHash,
        name: SEED_API_KEY_NAME,
      })
      yield* ctx.repositories.apiKey.save(apiKey)
      console.log(`  -> api key: ${apiKey.name}`)
      console.log(`  -> token: ${SEED_API_KEY_TOKEN}`)
    }),
}

export const apiKeySeeders: readonly Seeder[] = [seedApiKeys]
