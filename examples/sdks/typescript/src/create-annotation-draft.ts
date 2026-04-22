/**
 * Variant: create the annotation as a **draft** (`draft: true`). The server
 * writes `draftedAt !== null` and the debounced `annotation-scores:publish`
 * task picks it up later. Useful for editable review flows.
 *
 * Prereq: the SDK must be built (`dist/` populated). From the repo root:
 *   pnpm --filter @latitude-data/sdk build
 *
 * From this directory:
 *   pnpm annotate:draft
 *
 * From the repo root (workspace filter, how you'd run it under Turbo):
 *   pnpm --filter @examples/sdk-typescript annotate:draft
 */
import { LatitudeApiClient } from "@latitude-data/sdk"
import { requireEnv } from "./env.ts"

const client = new LatitudeApiClient({
  baseUrl: requireEnv("LATITUDE_API_BASE_URL"),
  token: requireEnv("LATITUDE_API_KEY"),
})

const annotation = await client.annotations.create(
  requireEnv("LATITUDE_ORGANIZATION_ID"),
  requireEnv("LATITUDE_PROJECT_SLUG"),
  {
    value: 0.2,
    passed: false,
    feedback: "Draft from the SDK example — will stay editable until published",
    draft: true,
    trace: {
      by: "id",
      id: requireEnv("LATITUDE_TRACE_ID"),
    },
  },
)

console.log("Created draft annotation (draftedAt should be non-null):")
console.log(JSON.stringify(annotation, null, 2))
