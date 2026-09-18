import { parseArgs } from "node:util"
import {
  computeAgentScore,
  resolveLaunchArtifacts,
  runCostSpeedShadow,
  ScoreWindowSource,
  type ShadowResourceSample,
} from "@domain/agent-score"
import { FLAGGER_DEFAULT_CLASSIFIER_MODEL } from "@domain/flaggers"
import { OrganizationId, ProjectId, type SessionId } from "@domain/shared"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import {
  FlaggerScreeningDecisionRepositoryLive,
  MemoryRepositoryLive,
  OutcomeWindowDecisionSourceLive,
  SafetyWindowDecisionSourceLive,
  ScoreWindowSourceLive,
  SessionAnalysisRepositoryLive,
  SessionAssessmentBulkTelemetrySourceLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SessionSemanticMomentRepositoryLive,
  SpanRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  ScoreRepositoryLive,
  SessionAssessmentBulkJudgmentSourceLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const USAGE = `
Usage: pnpm --filter @app/workers agent-score:shadow -- [options]

Reads a project's window and reports what Cost and Speed would say, writing nothing.

Options:
  --organization-id <id>  Organization owning the project (required)
  --project-id <id>       Project to read (required)
  --days <n>              Window length in days (default 28)
  --runs <n>              Repeat the read and compare (default 1; use 2 to check determinism)
  --full                  Also run the whole five-dimension computation and report its verdict
  --help
`

const DEFAULT_WINDOW_DAYS = 28

/**
 * ClickHouse work done during a run, sampled around each batch.
 *
 * The client does not expose counters, so queries are counted by wrapping the method and rows and
 * bytes come from the summary header ClickHouse attaches when it sends one. A run against a client
 * that omits it reports timings and heap without them, which is the honest degradation: an absent
 * counter is not a zero.
 */
interface QueryCounters {
  queryCount: number
  rowsRead: number
  bytesRead: number
  summarySeen: boolean
}

const instrumentClickHouse = (client: ReturnType<typeof getClickhouseClient>) => {
  const counters: QueryCounters = { queryCount: 0, rowsRead: 0, bytesRead: 0, summarySeen: false }
  const original = client.query.bind(client)

  client.query = (async (params: Parameters<typeof original>[0]) => {
    counters.queryCount += 1
    const result = await original(params)
    const header = (result as { response_headers?: Record<string, string | string[]> }).response_headers?.[
      "x-clickhouse-summary"
    ]
    const raw = Array.isArray(header) ? header[0] : header
    if (raw) {
      try {
        const summary = JSON.parse(raw) as { read_rows?: string; read_bytes?: string }
        counters.rowsRead += Number(summary.read_rows ?? 0)
        counters.bytesRead += Number(summary.read_bytes ?? 0)
        counters.summarySeen = true
      } catch {
        // A summary we cannot parse is one we do not report, never a zero.
      }
    }
    return result
  }) as typeof client.query

  return counters
}

const sampleOf = (counters: QueryCounters): ShadowResourceSample => ({
  queryCount: counters.queryCount,
  heapUsedBytes: process.memoryUsage().heapUsed,
  ...(counters.summarySeen ? { rowsRead: counters.rowsRead, bytesRead: counters.bytesRead } : {}),
})

const formatBytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MiB`

const formatMs = (milliseconds: number): string =>
  milliseconds >= 1_000 ? `${(milliseconds / 1_000).toFixed(1)}s` : `${milliseconds.toFixed(0)}ms`

const clickHouseLayers = Layer.mergeAll(
  ScoreWindowSourceLive,
  OutcomeWindowDecisionSourceLive,
  SafetyWindowDecisionSourceLive,
  SessionAssessmentBulkTelemetrySourceLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        SessionRepositoryLive,
        SpanRepositoryLive,
        SessionAnalysisRepositoryLive,
        SessionSemanticMomentRepositoryLive,
        SessionMomentLabelRepositoryLive,
        FlaggerScreeningDecisionRepositoryLive,
        MemoryRepositoryLive,
      ),
    ),
  ),
)

const postgresLayers = SessionAssessmentBulkJudgmentSourceLive.pipe(
  Layer.provideMerge(Layer.mergeAll(ScoreRepositoryLive, SignalRepositoryLive)),
)

const provide = <A, E, R>({
  effect,
  organizationId,
}: {
  readonly effect: Effect.Effect<A, E, R>
  readonly organizationId: OrganizationId
}) =>
  effect.pipe(
    withPostgres(Layer.mergeAll(postgresLayers, ScoreRepositoryLive), getPostgresClient(), organizationId),
    withClickHouse(clickHouseLayers, getClickhouseClient(), organizationId),
    Effect.provide(RedisCacheStoreLive(getRedisClient())),
  ) as Effect.Effect<A, E, never>

const readSessionIds = ({
  organizationId,
  projectId,
  from,
  to,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly from: Date
  readonly to: Date
}) =>
  provide({
    organizationId,
    effect: Effect.gen(function* () {
      const source = yield* ScoreWindowSource
      return yield* source.readEligibleSessionIds({ organizationId, projectId, from, to })
    }),
  })

/** The fields a rerun must reproduce exactly. Timings and heap are expected to move; these are not. */
const deterministicFingerprint = (report: {
  readonly cost: { readonly cost: number }
  readonly speed: { readonly speed: number }
  readonly interval: { readonly cost: { readonly lower: number; readonly upper: number } }
  readonly fold: { readonly foldedSessionCount: number; readonly withheldSessionCount: number }
  readonly familyCoverage: Readonly<Record<string, number>>
}) =>
  JSON.stringify({
    cost: report.cost.cost,
    speed: report.speed.speed,
    costInterval: report.interval.cost,
    folded: report.fold.foldedSessionCount,
    withheld: report.fold.withheldSessionCount,
    familyCoverage: report.familyCoverage,
  })

const main = async () => {
  loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

  // `pnpm run <script> -- --flag` forwards the separator itself, and `parseArgs` would read every
  // flag after it as a positional. Dropping it makes both invocation styles behave the same.
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== "--"),
    options: {
      "organization-id": { type: "string" },
      "project-id": { type: "string" },
      days: { type: "string" },
      runs: { type: "string" },
      full: { type: "boolean" },
      help: { type: "boolean" },
    },
  })

  if (values.help || !values["organization-id"] || !values["project-id"]) {
    console.log(USAGE)
    if (!values.help) process.exitCode = 1
    return
  }

  const organizationId = OrganizationId(values["organization-id"])
  const projectId = ProjectId(values["project-id"])
  const windowDays = values.days ? Number(values.days) : DEFAULT_WINDOW_DAYS
  const runs = values.runs ? Number(values.runs) : 1
  if (!Number.isInteger(windowDays) || windowDays <= 0) throw new Error("--days must be a positive integer")
  if (!Number.isInteger(runs) || runs <= 0) throw new Error("--runs must be a positive integer")

  const to = new Date()
  const from = new Date(to.getTime() - windowDays * 86_400_000)
  const artifacts = resolveLaunchArtifacts({ judge: FLAGGER_DEFAULT_CLASSIFIER_MODEL })

  console.log(`Agent Score shadow run`)
  console.log(`  project           ${projectId}`)
  console.log(`  window            ${windowDays} days to ${to.toISOString()}`)
  console.log(`  scoring version   ${artifacts.version.scoringVersion} (${artifacts.version.origin})`)
  console.log(`  cost artifact     ${artifacts.cost.artifactVersion} (${artifacts.cost.calibration})`)
  console.log(`  latency reference ${artifacts.latency.artifactVersion} (${artifacts.latency.calibration})`)

  const sessionIds = (await Effect.runPromise(
    readSessionIds({ organizationId, projectId, from, to }),
  )) as readonly SessionId[]
  console.log(`\n${sessionIds.length} eligible sessions`)
  if (sessionIds.length === 0) {
    console.log("Nothing to read. A shadow run over an empty window says nothing about calibration.")
    return
  }

  const fingerprints: string[] = []

  for (let run = 1; run <= runs; run += 1) {
    const counters = instrumentClickHouse(getClickhouseClient())
    const report = await Effect.runPromise(
      provide({
        organizationId,
        effect: runCostSpeedShadow({
          organizationId,
          projectId,
          sessionIds,
          cutoff: to,
          artifact: artifacts.cost,
          latencyArtifact: artifacts.latency,
          catalog: artifacts.catalog,
          probe: { sample: () => sampleOf(counters) },
        }),
      }),
    )

    fingerprints.push(deterministicFingerprint(report))

    console.log(`\n--- run ${run} of ${runs} ---`)
    console.log(`  read              ${report.readSessionCount} of ${report.requestedSessionCount} sessions`)
    console.log(`  folded            ${report.fold.foldedSessionCount}`)
    console.log(`  withheld          ${report.fold.withheldSessionCount} (required family unreadable)`)
    console.log(`  Cost              ${report.cost.cost.toFixed(1)}`)
    console.log(`  Speed             ${report.speed.speed.toFixed(1)}`)
    console.log(
      `  Cost interval     ${report.interval.cost.lower.toFixed(1)} to ${report.interval.cost.upper.toFixed(1)}`,
    )
    console.log(`\n  family penalties`)
    for (const [family, penalty] of Object.entries(report.cost.familyPenalties)) {
      const coverage = report.familyCoverage[family]
      console.log(
        `    ${family.padEnd(9)} penalty ${penalty.toFixed(3)}  coverage ${
          coverage === undefined ? "n/a" : coverage.toFixed(2)
        }`,
      )
    }
    console.log(`\n  per-session penalty share, by decile`)
    for (const distribution of report.familyDistributions) {
      if (distribution.sessionCount === 0) continue
      console.log(
        `    ${distribution.family.padEnd(9)} n=${String(distribution.sessionCount).padEnd(6)} ${distribution.deciles
          .map((value) => value.toFixed(2))
          .join(" ")}`,
      )
    }
    console.log(`\n  resources`)
    console.log(`    resolver        ${formatMs(report.resources.resolverMs)}`)
    console.log(`    slowest batch   ${formatMs(report.resources.slowestBatchMs)}`)
    console.log(`    batches         ${report.batchCount}`)
    console.log(`    queries         ${report.resources.queryCount ?? "not counted"}`)
    console.log(
      `    rows read       ${report.resources.rowsRead === undefined ? "not reported" : report.resources.rowsRead.toLocaleString()}`,
    )
    console.log(
      `    bytes read      ${report.resources.bytesRead === undefined ? "not reported" : formatBytes(report.resources.bytesRead)}`,
    )
    console.log(
      `    peak heap       ${report.resources.peakHeapUsedBytes === undefined ? "not sampled" : formatBytes(report.resources.peakHeapUsedBytes)}`,
    )
  }

  if (runs > 1) {
    const stable = fingerprints.every((fingerprint) => fingerprint === fingerprints[0])
    console.log(
      `\ndeterminism      ${stable ? "stable across runs" : "DRIFTED — the pipeline carries state it should not"}`,
    )
    if (!stable) process.exitCode = 1
  }

  if (values.full) {
    const result = await Effect.runPromise(
      provide({
        organizationId,
        effect: computeAgentScore({
          organizationId,
          projectId,
          to,
          artifact: artifacts.agentScore,
          costArtifact: artifacts.cost,
          catalog: artifacts.catalog,
          latencyArtifact: artifacts.latency,
          judge: FLAGGER_DEFAULT_CLASSIFIER_MODEL,
        }),
      }),
    )

    console.log(`\n--- five dimensions ---`)
    console.log(`  status            ${result.status}${result.withheldReason ? ` (${result.withheldReason})` : ""}`)
    console.log(`  window            ${result.window ? `${result.window.stepDays} days` : "not selected"}`)
    for (const dimension of result.dimensions) {
      console.log(
        `    ${dimension.scoreDimension.padEnd(12)} ${
          dimension.score === undefined ? "unmeasured" : dimension.score.toFixed(1).padStart(6)
        }  ${dimension.coverage === "measured" ? "" : `(${dimension.unmeasuredReason ?? "unmeasured"})`}`,
      )
    }
    if (result.composite) console.log(`  Agent Score       ${result.composite.score.toFixed(1)}`)
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
