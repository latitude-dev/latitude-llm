/**
 * Minimal example: create a published annotation via the SDK using an explicit
 * trace id.
 *
 * Prereq: the SDK must be built (`dist/` populated), since the package routes
 * imports through `main`/`exports`. From the repo root:
 *   pnpm --filter @latitude-data/sdk build
 *
 * From this directory:
 *   pnpm annotate:byTraceId
 *
 * From the repo root (workspace filter, how you'd run it under Turbo):
 *   pnpm --filter @examples/sdk-typescript annotate:byTraceId
 *
 * Both invocations load `.env` via Node's built-in `--env-file` flag.
 */
import { LatitudeApiClient } from "@latitude-data/sdk"
import { requireEnv } from "./env.ts"

const client = new LatitudeApiClient({
  baseUrl: requireEnv("LATITUDE_API_BASE_URL"),
  token: requireEnv("LATITUDE_API_KEY"),
})

const annotation = await client.annotations.create(requireEnv("LATITUDE_PROJECT_SLUG"), {
  value: 1,
  passed: true,
  feedback: "Good response — written from the SDK example",
  trace: {
    by: "id",
    id: requireEnv("LATITUDE_TRACE_ID"),
  },
})

console.log("Created annotation:")
console.log(JSON.stringify(annotation, null, 2))
