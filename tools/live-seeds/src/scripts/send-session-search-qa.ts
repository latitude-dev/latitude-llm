import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { sendLiveSeedData } from "../index.ts"

const USAGE = `
Usage: pnpm seed:session-search-qa [options]

Seeds 7 engineered sessions for LAT-599 session-level search QA + LAT-601
highlights QA. See the companion checklist at dev-docs/qa/session-search.md
for the query → expected result table.

Sessions produced (one each at the default count of 1):
  - qa-refund-4-1:                4 turns, every turn mentions "refund"
  - qa-code-3-1:                   3 turns about TypeScript/React (negative control)
  - qa-mixed-6-1:                  6 turns, only 2 mention "refund"
  - qa-cancellation-5-1:           5 turns, semantic-only "money back" target
                                   (never says the literal word "refund")
  - qa-deep-20-1:                  20 turns, "refund" appears at turns 5, 12, 18.
                                   The densest match is turn 12 — QA target for
                                   "scroll to the best match" inside a trace.
  - qa-oversized-collapsed-1:      1 trace with one ~28k-char assistant message,
                                   "refund" planted in head, collapsed middle, and
                                   tail. LAT-601 PR3 QA target for chip rendering
                                   across split markdown parts and the
                                   "M matches hidden" affordance.
  - qa-tool-reasoning-indexing-1:  1 trace where "PAYMENT_DECLINED" only appears
                                   inside a tool_call_response payload and
                                   "backstage thought" only inside a reasoning
                                   part — neither shows up in the final assistant
                                   text. QA target for the lexical/embedding
                                   formatter split that indexes both for search.

Options:
  --project-slug <slug>          Target project slug (default: default-project,
                                 the seeded Acme org default project).
  --api-key-token <token>        Ingest API key (default: seed token).
  --ingest-url <url>             Base URL for the ingest service
                                 (default: http://127.0.0.1:\${LAT_INGEST_PORT}).
  --count <n>                    Number of full variant cycles to send (default: 1).
                                 1 → one session per variant (7 sessions total).
                                 2 → two of each variant (14 sessions total: qa-refund-4-1
                                 and qa-refund-4-2, etc.).
  --time-scale <n>               Multiply fixture delays by this factor (default: 1).
  --parallel-cases <n>           Concurrency for case dispatch (default: 4).
  --seed <value>                 Seed for reproducible inter-turn timing.
  --help                         Show this help.
`.trim()

function loadToolSeedEnvironments(importMetaUrl: string): void {
  const nodeEnv = process.env.NODE_ENV ?? "development"
  const envPath = fileURLToPath(new URL(`../../../../.env.${nodeEnv}`, importMetaUrl))

  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }
}

function resolveDefaultIngestUrl(): string {
  const port = Effect.runSync(parseEnv("LAT_INGEST_PORT", "number", 3002))
  return `http://127.0.0.1:${port.toString()}`
}

function parsePositiveNumber(value: string, flagName: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive number, received "${value}"`)
  }
  return parsed
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = parsePositiveNumber(value, flagName)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${flagName} must be an integer, received "${value}"`)
  }
  return parsed
}

const VARIANT_COUNT = 7 as const

loadToolSeedEnvironments(import.meta.url)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "project-slug": { type: "string", default: "default-project" },
    "api-key-token": { type: "string" },
    "ingest-url": { type: "string" },
    count: { type: "string", default: "1" },
    "time-scale": { type: "string", default: "1" },
    "parallel-cases": { type: "string", default: "4" },
    seed: { type: "string" },
    help: { type: "boolean", default: false },
  },
})

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

if (positionals.length > 0) {
  console.error(`Unexpected positional arguments: ${positionals.join(" ")}`)
  console.log(USAGE)
  process.exit(1)
}

const cycleCount = parsePositiveInteger(values.count ?? "1", "--count")
// One "cycle" = one of each variant. countPerFixture passed to sendLiveSeedData
// is the total number of cases generated for THIS fixture, so total = cycles × variants.
const countPerFixture = cycleCount * VARIANT_COUNT
const ingestBaseUrl = values["ingest-url"] ?? resolveDefaultIngestUrl()
const timeScale = parsePositiveNumber(values["time-scale"] ?? "1", "--time-scale")
const parallelCases = parsePositiveInteger(values["parallel-cases"] ?? "4", "--parallel-cases")
const projectSlug = values["project-slug"] ?? "default-project"

const options = {
  fixtureKeys: ["session-search-qa"],
  ingestBaseUrl,
  timeScale,
  countPerFixture,
  parallelCases,
  // The fixture defines no flagger sampling, so there's nothing to provision.
  // Skipping is also faster and keeps the QA run hermetic.
  provisionFlaggers: false,
  verboseSpans: false,
  projectSlug,
  ...(values["api-key-token"] ? { apiKeyToken: values["api-key-token"] } : {}),
  ...(values.seed ? { seed: values.seed } : {}),
}

console.log(
  `Seeding session-search QA: ${cycleCount.toString()} cycle(s) × ${VARIANT_COUNT.toString()} variants = ${countPerFixture.toString()} sessions → project "${projectSlug}"`,
)

void sendLiveSeedData(options)
  .then(() => {
    console.log("")
    console.log("✓ Done. Next steps:")
    console.log("  1. Wait ~10 seconds for the trace-search worker to index the new traces")
    console.log("     (debounce after trace-end:run — see apps/workers/src/workers/trace-search.ts).")
    console.log("  2. Make sure the session-search-v2 feature flag is enabled for your org via")
    console.log("     /backoffice/feature-flags/.")
    console.log("  3. Open /projects/<project-slug>/session-search/ and run the queries listed in")
    console.log("     dev-docs/qa/session-search.md.")
  })
  .catch((error: unknown) => {
    console.error("Failed to send session-search QA cases:")
    console.error(error)
    process.exitCode = 1
  })
