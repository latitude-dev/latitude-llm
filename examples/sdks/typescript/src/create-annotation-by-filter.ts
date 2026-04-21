/**
 * Variant: resolve the target trace by a `FilterSet` instead of by explicit
 * id. Useful when the caller knows a business attribute (e.g. `sessionId`)
 * but not the raw OTel trace id. Exactly one trace must match — 0 → 404,
 * 2+ → 400.
 *
 * Prereq: the SDK must be built (`dist/` populated). From the repo root:
 *   pnpm --filter @latitude-data/sdk build
 *
 * From this directory:
 *   pnpm annotate:byFilter
 *
 * From the repo root (workspace filter, how you'd run it under Turbo):
 *   pnpm --filter @examples/sdk-typescript annotate:byFilter
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
    value: 1,
    passed: true,
    feedback: "Annotation resolved via session-id filter",
    trace: {
      by: "filters",
      filters: {
        sessionId: [{ op: "eq", value: requireEnv("LATITUDE_SESSION_ID") }],
      },
    },
  },
)

console.log("Created annotation via filter:")
console.log(JSON.stringify(annotation, null, 2))
