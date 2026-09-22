import { parseArgs } from "node:util"
import { FleetLatencyReferenceRepository } from "@domain/admin"
import {
  buildLatencyReferenceArtifact,
  type LatencyReferenceArtifact,
  type ThroughputReferenceCohort,
  type TtftReferenceCohort,
} from "@domain/agent-score"
import { OrganizationId } from "@domain/shared"
import { FleetLatencyReferenceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { withTracing } from "@repo/observability"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getClickhouseClient } from "../clients.ts"

const USAGE = `
Usage: pnpm --filter @app/workers agent-score:calibrate-latency -- [options]

Builds a frozen latency-reference TypeScript module from a closed fleet window.
The module is written to stdout. The calibration report is written to stderr.

Options:
  --since <ISO date>                 Inclusive window start (required)
  --until <ISO date>                 Exclusive window end, not later than now (required)
  --ingested-until <ISO date>        Exclusive ingestion snapshot, not earlier than until (required)
  --artifact-version <version>       Version for the emitted artifact (required)
  --minimum-samples <n>              Minimum observations per cohort (default 200)
  --minimum-organizations <n>        Minimum organizations per cohort (default 5)
  --help
`

const positiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

const instant = (value: string | undefined, name: string): Date => {
  if (!value) throw new Error(`${name} is required`)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO date`)
  return parsed
}

const fields = (values: Readonly<Record<string, string | number | boolean | undefined>>): string =>
  Object.entries(values)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : value}`)
    .join(", ")

const renderTtft = (cohort: TtftReferenceCohort): string => {
  const base = {
    provider: cohort.provider,
    model: cohort.model,
    granularity: cohort.granularity,
    ...(cohort.granularity === "cohort" ? { inputBucket: cohort.inputBucket, streaming: cohort.streaming } : {}),
    sampleCount: cohort.sampleCount,
    organizationCount: cohort.organizationCount,
    medianTtftNs: cohort.medianTtftNs,
  }
  return `  { ${fields(base)} },`
}

const renderThroughput = (cohort: ThroughputReferenceCohort): string => {
  const base = {
    provider: cohort.provider,
    model: cohort.model,
    granularity: cohort.granularity,
    ...(cohort.granularity === "cohort"
      ? {
          inputBucket: cohort.inputBucket,
          outputBucket: cohort.outputBucket,
          streaming: cohort.streaming,
        }
      : {}),
    sampleCount: cohort.sampleCount,
    organizationCount: cohort.organizationCount,
    medianTokensPerSecond: cohort.medianTokensPerSecond,
  }
  return `  { ${fields(base)} },`
}

const renderModule = ({
  artifact,
  since,
  until,
  ingestedAtUntil,
}: {
  readonly artifact: LatencyReferenceArtifact
  readonly since: Date
  readonly until: Date
  readonly ingestedAtUntil: Date
}): string => `import type {
  LatencyReferenceArtifact,
  ThroughputReferenceCohort,
  TtftReferenceCohort,
} from "../entities/latency-reference-artifact.ts"
import { provisionalFallbackFor } from "./provisional-latency-fallback.ts"

export const LAUNCH_LATENCY_ARTIFACT_VERSION = ${JSON.stringify(artifact.artifactVersion)}

export const LAUNCH_LATENCY_REFERENCE_FREEZE = {
  since: ${JSON.stringify(since.toISOString())},
  until: ${JSON.stringify(until.toISOString())},
  ingestedAtUntil: ${JSON.stringify(ingestedAtUntil.toISOString())},
  minimumSampleCount: ${artifact.minimumSampleCount},
  minimumOrganizationCount: ${artifact.minimumOrganizationCount},
} as const

export const LAUNCH_LATENCY_MINIMUM_SAMPLE_COUNT = LAUNCH_LATENCY_REFERENCE_FREEZE.minimumSampleCount
export const LAUNCH_LATENCY_MINIMUM_ORGANIZATION_COUNT = LAUNCH_LATENCY_REFERENCE_FREEZE.minimumOrganizationCount

const ttftCohorts = [
${artifact.ttft.map(renderTtft).join("\n")}
] satisfies readonly TtftReferenceCohort[]

const throughputCohorts = [
${artifact.throughput.map(renderThroughput).join("\n")}
] satisfies readonly ThroughputReferenceCohort[]

export const LAUNCH_LATENCY_REFERENCE_ARTIFACT = {
  artifactVersion: LAUNCH_LATENCY_ARTIFACT_VERSION,
  calibration: "calibrated",
  minimumSampleCount: LAUNCH_LATENCY_REFERENCE_FREEZE.minimumSampleCount,
  minimumOrganizationCount: LAUNCH_LATENCY_REFERENCE_FREEZE.minimumOrganizationCount,
  ttft: ttftCohorts,
  throughput: throughputCohorts,
  provisionalFallback: provisionalFallbackFor({ ttft: ttftCohorts, throughput: throughputCohorts }),
} satisfies LatencyReferenceArtifact
`

const main = async () => {
  loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== "--"),
    options: {
      since: { type: "string" },
      until: { type: "string" },
      "ingested-until": { type: "string" },
      "artifact-version": { type: "string" },
      "minimum-samples": { type: "string" },
      "minimum-organizations": { type: "string" },
      help: { type: "boolean" },
    },
  })

  if (values.help) {
    console.log(USAGE)
    return
  }

  const since = instant(values.since, "--since")
  const until = instant(values.until, "--until")
  const ingestedAtUntil = instant(values["ingested-until"], "--ingested-until")
  if (since >= until) throw new Error("--since must be before --until")
  if (until > new Date()) throw new Error("--until must describe a closed window")
  if (ingestedAtUntil < until) throw new Error("--ingested-until must not be before --until")
  if (ingestedAtUntil > new Date()) throw new Error("--ingested-until must describe a closed snapshot")
  const artifactVersion = values["artifact-version"]
  if (!artifactVersion) throw new Error("--artifact-version is required")

  const minimumSampleCount = positiveInteger(values["minimum-samples"], 200, "--minimum-samples")
  const minimumOrganizationCount = positiveInteger(values["minimum-organizations"], 5, "--minimum-organizations")
  const client = getClickhouseClient()
  const report = await Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* FleetLatencyReferenceRepository
      const window = { since, until, ingestedAtUntil }
      const [ttftSamples, throughputSamples] = yield* Effect.all(
        [repository.listTtftSamples(window), repository.listThroughputSamples(window)],
        { concurrency: 2 },
      )
      return buildLatencyReferenceArtifact({
        artifactVersion,
        ttftSamples,
        throughputSamples,
        minimumSampleCount,
        minimumOrganizationCount,
      })
    }).pipe(withClickHouse(FleetLatencyReferenceRepositoryLive, client, OrganizationId("system")), withTracing),
  ).finally(() => client.close())

  console.error(
    JSON.stringify({
      window: {
        since: since.toISOString(),
        until: until.toISOString(),
        ingestedAtUntil: ingestedAtUntil.toISOString(),
      },
      gates: { minimumSampleCount, minimumOrganizationCount },
      ttftCohortCount: report.ttftCohortCount,
      throughputCohortCount: report.throughputCohortCount,
      rejected: report.rejected,
    }),
  )
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(`${renderModule({ artifact: report.artifact, since, until, ingestedAtUntil })}\n`, (error) =>
      error ? reject(error) : resolve(),
    )
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
