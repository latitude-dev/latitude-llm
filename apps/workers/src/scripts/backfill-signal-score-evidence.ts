import { parseArgs } from "node:util"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  type BackfillSignalScoreEvidenceResult,
  backfillSignalScoreEvidenceUseCase,
  SignalRepository,
  type SignalScoreEvidence,
  type SignalScoreEvidenceBackfillTarget,
} from "@domain/signals"
import { AIGenerateLive, withAi } from "@platform/ai"
import {
  closePostgres,
  type PostgresClient,
  ScoreRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getPostgresClient } from "../clients.ts"

const BACKFILL_LOCK_NAME = "signal-score-evidence-backfill"

const USAGE = `
Usage: pnpm --filter @app/workers signal-score-evidence:backfill [options]

Selects promoted, system-discovered signals with empty scoreEvidence and at least one
published occurrence in the past month. Each signal uses a dominant mapped flagger
when available and otherwise classifies its canonical name and description with the LLM.

The default mode is a read-only routing preview. It does not call the LLM.

Options:
  --execute                Classify signals and update the selected database rows
  --organization-id <id>  Restrict the backfill to one organization
  --project-id <id>       Restrict the backfill to one project
  --since <ISO timestamp> Override the default cutoff of CURRENT_TIMESTAMP - INTERVAL '30 days'
  --limit <n>              Process at most this many signals
  --help                   Show this help
`.trim()

interface Summary {
  deterministic: number
  llm: number
  diagnostic: number
  applied: number
  skipped: number
  failed: number
}

const parsePositiveInteger = (value: string, flagName: string): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer, received "${value}"`)
  }
  return parsed
}

const parseSince = (value: string | undefined): Date | undefined => {
  if (value === undefined) return undefined
  const since = new Date(value)
  if (Number.isNaN(since.getTime())) {
    throw new Error(`--since must be an ISO timestamp, received "${value}"`)
  }
  return since
}

const listTargets = (
  postgres: PostgresClient,
  filters: {
    readonly organizationId?: string
    readonly projectId?: string
    readonly since?: Date
    readonly limit?: number
  },
): Promise<readonly SignalScoreEvidenceBackfillTarget[]> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* SignalRepository
      return yield* repository.listScoreEvidenceBackfillTargets({
        ...(filters.organizationId ? { organizationId: OrganizationId(filters.organizationId) } : {}),
        ...(filters.projectId ? { projectId: ProjectId(filters.projectId) } : {}),
        ...(filters.since ? { since: filters.since } : {}),
        ...(filters.limit ? { limit: filters.limit } : {}),
      })
    }).pipe(withPostgres(SignalRepositoryLive, postgres), withTracing),
  )

const runTarget = (
  postgres: PostgresClient,
  target: SignalScoreEvidenceBackfillTarget,
  execute: boolean,
): Promise<BackfillSignalScoreEvidenceResult> =>
  Effect.runPromise(
    backfillSignalScoreEvidenceUseCase({ ...target, execute }).pipe(
      withPostgres(Layer.mergeAll(SignalRepositoryLive, ScoreRepositoryLive), postgres, target.organizationId),
      withAi(AIGenerateLive),
      withTracing,
    ),
  )

const formatEvidence = (scoreEvidence: readonly SignalScoreEvidence[]): string =>
  scoreEvidence.length === 0
    ? "Diagnostic"
    : scoreEvidence.map((evidence) => `${evidence.scoreDimension}:${evidence.role}`).join(", ")

const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return [
    hours > 0 ? `${hours.toString()}h` : "",
    minutes > 0 ? `${minutes.toString()}m` : "",
    `${seconds.toString()}s`,
  ]
    .filter(Boolean)
    .join(" ")
}

const formatProgress = (completed: number, total: number, startedAt: number): string => {
  const elapsedMs = Date.now() - startedAt
  const percentage = total === 0 ? 100 : (completed / total) * 100
  const remainingMs = completed === 0 ? 0 : (elapsedMs / completed) * (total - completed)
  return `[${completed.toString()}/${total.toString()} ${percentage.toFixed(1)}%] elapsed=${formatDuration(elapsedMs)} eta=${formatDuration(remainingMs)}`
}

const formatError = (error: unknown): string => (error instanceof Error ? error.message : String(error))

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    execute: { type: "boolean", default: false },
    "organization-id": { type: "string" },
    "project-id": { type: "string" },
    since: { type: "string" },
    limit: { type: "string" },
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

const execute = values.execute ?? false
const limit = values.limit ? parsePositiveInteger(values.limit, "--limit") : undefined
const since = parseSince(values.since)
const adminPostgres = getAdminPostgresClient()
const appPostgres = getPostgresClient()

const main = async (): Promise<void> => {
  const lockClient = execute ? await adminPostgres.pool.connect() : undefined
  try {
    if (lockClient) {
      const result = await lockClient.query<{ readonly acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [BACKFILL_LOCK_NAME],
      )
      if (!result.rows[0]?.acquired) {
        throw new Error("Another signal score-evidence backfill is already running")
      }
    }

    const targets = await listTargets(adminPostgres, {
      ...(values["organization-id"] ? { organizationId: values["organization-id"] } : {}),
      ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
      ...(since ? { since } : {}),
      ...(limit ? { limit } : {}),
    })
    const summary: Summary = { deterministic: 0, llm: 0, diagnostic: 0, applied: 0, skipped: 0, failed: 0 }
    const startedAt = Date.now()

    console.log(`${execute ? "EXECUTE" : "PREVIEW"}: ${targets.length.toString()} selected`)

    for (const [index, target] of targets.entries()) {
      const completed = index + 1
      try {
        const result = await runTarget(appPostgres, target, execute)
        if (result.action === "skipped") {
          summary.skipped += 1
          console.log(
            `${formatProgress(completed, targets.length, startedAt)} ${target.signalId} -> skipped (${result.reason})`,
          )
          continue
        }

        summary[result.method] += 1
        if (result.action === "planned") {
          console.log(
            `${formatProgress(completed, targets.length, startedAt)} ${target.signalId} -> ${
              result.method === "llm" ? "LLM" : `deterministic (${result.dominantFlaggerSlug})`
            }`,
          )
          continue
        }

        if (result.scoreEvidence.length === 0) summary.diagnostic += 1
        if (result.applied) summary.applied += 1
        else summary.skipped += 1
        console.log(
          `${formatProgress(completed, targets.length, startedAt)} ${target.signalId} -> ${result.method} -> ${formatEvidence(result.scoreEvidence)}${result.applied ? "" : " (not updated)"}`,
        )
      } catch (error) {
        summary.failed += 1
        console.error(
          `${formatProgress(completed, targets.length, startedAt)} ${target.signalId} -> failed: ${formatError(error)}`,
        )
      }
    }

    console.log(JSON.stringify({ ...summary, elapsed: formatDuration(Date.now() - startedAt) }, null, 2))
    if (summary.failed > 0) process.exitCode = 1
  } finally {
    lockClient?.release()
  }
}

void main()
  .catch((error: unknown) => {
    console.error("Signal score-evidence backfill failed")
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await Promise.allSettled([closePostgres(adminPostgres.pool), closePostgres(appPostgres.pool)])
  })
