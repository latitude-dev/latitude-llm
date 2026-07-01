/**
 * Minimal example: list the API keys for an organization via the SDK.
 *
 * Tokens are intentionally omitted from the list response (the `token` field
 * is only included in the creation response — see `client.apiKeys.create`).
 *
 * Prereq: the SDK must be built (`dist/` populated). From the repo root:
 *   pnpm --filter @latitude-data/sdk build
 *
 * From this directory:
 *   pnpm apiKeys:list
 *
 * From the repo root (workspace filter, how you'd run it under Turbo):
 *   pnpm --filter @examples/sdk-typescript apiKeys:list
 */
import { LatitudeClient } from "@latitude-data/sdk"
import { optionalEnv, requireEnv } from "./env.ts"

const client = new LatitudeClient({
  baseUrl: optionalEnv("LATITUDE_API_BASE_URL"),
  apiKey: requireEnv("LATITUDE_API_KEY"),
})

const { apiKeys } = await client.apiKeys.list()

console.log(`Found ${apiKeys.length} API key(s):`)
console.log(JSON.stringify(apiKeys, null, 2))
