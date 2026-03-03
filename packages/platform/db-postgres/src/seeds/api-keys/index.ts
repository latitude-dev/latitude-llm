import { createApiKey } from "@domain/api-keys"
import { ApiKeyId } from "@domain/shared-kernel"
import { hashApiKeyToken } from "@repo/utils"
import { Effect } from "effect"
import { SEED_ORG_ID } from "../organizations/index.ts"
import type { SeedContext, Seeder } from "../types.ts"

const SEED_API_KEY_ID = ApiKeyId("v42lqe92hgq2hpvilg91brnt")
const SEED_API_KEY_TOKEN = "lat_seed_default_api_key_token"

const seedApiKeys: Seeder = {
  name: "api-keys/default-key",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const apiKey = createApiKey({
        id: SEED_API_KEY_ID,
        organizationId: SEED_ORG_ID,
        token: SEED_API_KEY_TOKEN,
        tokenHash: hashApiKeyToken(SEED_API_KEY_TOKEN),
        name: "Default API Key",
      })
      yield* ctx.repositories.apiKey.save(apiKey)
      console.log(`    API Key token: ${SEED_API_KEY_TOKEN}`)
    }),
}

export const apiKeySeeders: readonly Seeder[] = [seedApiKeys]
