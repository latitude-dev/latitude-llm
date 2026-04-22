import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { printFixtureCatalog, sendLiveSeedData } from "../index.ts"

const USAGE = `
Usage: pnpm seed:live-seeds [options]

Options:
  --fixtures <a,b,c>             Comma-separated fixture keys to send
  --ingest-url <url>             Base URL for the ingest service
  --project-slug <slug>          Target project slug (default: seeded default-project). When
                                 overridden, the tool finds (or creates) the project by slug in
                                 the Acme seed org and auto-restricts fixtures to system-queue-only.
  --api-key-token <token>        Ingest API key (default: seed token lat_seed_default_api_key_token)
  --time-scale <n>               Multiply fixture delays by this factor (default: 1)
  --count-per-fixture <n>        Generate this many cases per selected fixture (default: 5)
  --parallel-cases <n>           Number of cases to dispatch concurrently (default: 4)
  --parallel-traces <n>          Alias for --parallel-cases
  --seed <value>                 Seed for reproducible trace generation
  --verbose-spans                Print one log line per span in addition to summary progress
  --no-provision-system-queues   Skip provisioning the default system queues
  --list-fixtures                Print the available fixture keys and exit
  --help                         Show this help
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

loadToolSeedEnvironments(import.meta.url)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fixtures: { type: "string" },
    "ingest-url": { type: "string" },
    "project-slug": { type: "string" },
    "api-key-token": { type: "string" },
    "time-scale": { type: "string", default: "1" },
    "count-per-fixture": { type: "string", default: "5" },
    "parallel-cases": { type: "string" },
    "parallel-traces": { type: "string", default: "4" },
    seed: { type: "string" },
    "verbose-spans": { type: "boolean", default: false },
    "no-provision-system-queues": { type: "boolean", default: false },
    "list-fixtures": { type: "boolean", default: false },
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

if (values["list-fixtures"]) {
  printFixtureCatalog()
  process.exit(0)
}

const fixtureKeys =
  values.fixtures
    ?.split(",")
    .map((fixture) => fixture.trim())
    .filter((fixture) => fixture.length > 0) ?? undefined

const ingestBaseUrl = values["ingest-url"] ?? resolveDefaultIngestUrl()
const timeScale = parsePositiveNumber(values["time-scale"] ?? "1", "--time-scale")
const countPerFixture = parsePositiveInteger(values["count-per-fixture"] ?? "5", "--count-per-fixture")
const parallelCases = parsePositiveInteger(
  values["parallel-cases"] ?? values["parallel-traces"] ?? "4",
  values["parallel-cases"] ? "--parallel-cases" : "--parallel-traces",
)
const provisionSystemQueues = !values["no-provision-system-queues"]
const verboseSpans = values["verbose-spans"] ?? false

const options = {
  ...(fixtureKeys ? { fixtureKeys } : {}),
  ingestBaseUrl,
  timeScale,
  countPerFixture,
  parallelCases,
  provisionSystemQueues,
  verboseSpans,
  ...(values.seed ? { seed: values.seed } : {}),
  ...(values["project-slug"] ? { projectSlug: values["project-slug"] } : {}),
  ...(values["api-key-token"] ? { apiKeyToken: values["api-key-token"] } : {}),
}

void sendLiveSeedData(options).catch((error: unknown) => {
  console.error("Failed to send live-seed cases:")
  console.error(error)
  process.exitCode = 1
})
