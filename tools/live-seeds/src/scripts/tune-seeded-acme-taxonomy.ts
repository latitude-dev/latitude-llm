#!/usr/bin/env tsx
import { AIGenerate, type GenerateInput, type GenerateResult } from "@domain/ai"
import { OrganizationId, ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import {
  recordSessionObservationUseCase,
  runProjectGardeningUseCase,
  TAXONOMY_BIRTH_LINK_THRESHOLD,
  TAXONOMY_BIRTH_MAX_DIAMETER,
  type TaxonomySummaryStrategy,
} from "@domain/taxonomy"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import {
  createRedisClient,
  createRedisConnection,
  RedisTaxonomyLockRepositoryLive,
  waitForRedisClientReady,
} from "@platform/cache-redis"
import {
  BehaviorObservationRepositoryLive,
  createClickhouseClient,
  SessionRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  createPostgresClient,
  TaxonomyCategoryRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect, Layer } from "effect"

loadDevelopmentEnvironments(import.meta.url)

interface Args {
  readonly organizationId: string
  readonly projectId: string
  readonly limit: number
  readonly reset: boolean
  readonly gardenNow: Date | undefined
  readonly rebaseObservationsToNow: boolean
}

const usage =
  () => `Usage: pnpm --filter @tools/live-seeds taxonomy:tune-seeded-acme -- --organization-id <orgId> --project-id <projectId> [--limit <n>] [--reset] [--garden-now <iso>] [--rebase-observations-to-now]

Runs the seeded-corpus taxonomy tuning loop with the production Voyage embedding adapter:
  1. optionally clears taxonomy rows for the project (--reset),
  2. indexes up to --limit ClickHouse sessions through recordSessionObservationUseCase,
  3. runs runProjectGardeningUseCase,
  4. prints run metrics plus cluster/category samples.

Use --rebase-observations-to-now for historical seed corpora whose session timestamps are outside the gardening lookback window.

Requires LAT_VOYAGE_API_KEY. Naming uses a deterministic local generator because this script tunes embedding-space thresholds, not naming quality.
Current threshold pair: link=${TAXONOMY_BIRTH_LINK_THRESHOLD}, maxDiameter=${TAXONOMY_BIRTH_MAX_DIAMETER}.
`

const parseArgs = (argv: readonly string[]): Args => {
  let organizationId = ""
  let projectId = ""
  let limit = 250
  let reset = false
  let gardenNow: Date | undefined
  let rebaseObservationsToNow = false

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    switch (arg) {
      case "--organization-id":
      case "--org-id":
        organizationId = argv[++index] ?? ""
        break
      case "--project-id":
        projectId = argv[++index] ?? ""
        break
      case "--limit": {
        const parsed = Number.parseInt(argv[++index] ?? "", 10)
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("--limit must be a positive integer")
        limit = parsed
        break
      }
      case "--reset":
        reset = true
        break
      case "--garden-now": {
        const parsed = new Date(argv[++index] ?? "")
        if (Number.isNaN(parsed.getTime())) throw new Error("--garden-now must be an ISO timestamp")
        gardenNow = parsed
        break
      }
      case "--rebase-observations-to-now":
        rebaseObservationsToNow = true
        break
      case "--help":
      case "-h":
        console.log(usage())
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!organizationId || !projectId) throw new Error("--organization-id and --project-id are required")
  return { organizationId, projectId, limit, reset, gardenNow, rebaseObservationsToNow }
}

const fakeNamingLayer = Layer.succeed(AIGenerate, {
  generate: <T>(input: GenerateInput<T>) =>
    Effect.sync((): GenerateResult<T> => {
      const raw = input.system.includes("proposeCandidateThemes")
        ? { candidates: [{ theme: "Seeded Acme behavior", examples: [0, 1, 2] }] }
        : {
            name: "Seeded Acme Behavior",
            description: "Seeded Acme sessions with similar customer support behavior.",
          }

      return {
        object: input.schema.parse(raw),
        tokens: 0,
        tokenUsage: { input: 0, output: 0 },
        duration: 0,
      }
    }),
})

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (!process.env.LAT_VOYAGE_API_KEY) {
    throw new Error("LAT_VOYAGE_API_KEY is required for production-equivalent threshold tuning")
  }

  const organizationId = OrganizationId(args.organizationId)
  const projectId = ProjectId(args.projectId)
  const clickhouse = createClickhouseClient()
  const postgres = createPostgresClient()
  const adminPostgres = process.env.LAT_ADMIN_DATABASE_URL
    ? createPostgresClient({ databaseUrl: process.env.LAT_ADMIN_DATABASE_URL })
    : createPostgresClient()
  const redis = createRedisClient(createRedisConnection())
  await waitForRedisClientReady(redis)

  const clickhouseLayer = Layer.mergeAll(BehaviorObservationRepositoryLive, SessionRepositoryLive, TraceRepositoryLive)
  const postgresLayer = Layer.mergeAll(
    TaxonomyCategoryRepositoryLive,
    TaxonomyClusterRepositoryLive,
    TaxonomyLineageRepositoryLive,
    TaxonomyRunRepositoryLive,
  )
  const provideRuntime = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      withClickHouse(clickhouseLayer, clickhouse, organizationId),
      withPostgres(postgresLayer, postgres, organizationId),
      withAi(Layer.mergeAll(AIEmbedLive, fakeNamingLayer), redis),
      Effect.provide(RedisTaxonomyLockRepositoryLive(redis)),
    )

  try {
    if (args.reset) {
      const nodeEnv = process.env.NODE_ENV ?? "development"
      if (nodeEnv !== "development" && nodeEnv !== "test") {
        throw new Error(
          `--reset refuses to run with NODE_ENV=${nodeEnv}. Set NODE_ENV=development if this is intentional.`,
        )
      }
      await adminPostgres.pool.query(
        `DELETE FROM latitude.taxonomy_cluster_lineage WHERE organization_id = $1 AND project_id = $2`,
        [organizationId, projectId],
      )
      await adminPostgres.pool.query(
        `DELETE FROM latitude.taxonomy_clusters WHERE organization_id = $1 AND project_id = $2`,
        [organizationId, projectId],
      )
      await adminPostgres.pool.query(
        `DELETE FROM latitude.taxonomy_categories WHERE organization_id = $1 AND project_id = $2`,
        [organizationId, projectId],
      )
      await adminPostgres.pool.query(
        `DELETE FROM latitude.taxonomy_runs WHERE organization_id = $1 AND project_id = $2`,
        [organizationId, projectId],
      )
      await clickhouse.command({
        query:
          "ALTER TABLE behavior_observations DELETE WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}",
        query_params: { organizationId, projectId },
        clickhouse_settings: { mutations_sync: "2" },
      })
      await clickhouse.command({ query: "OPTIMIZE TABLE behavior_observations FINAL" })
    }

    const sessions = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* SessionRepository
        const page = yield* repository.listByProjectId({
          organizationId,
          projectId,
          options: { limit: args.limit, sortBy: "lastActivity", sortDirection: "asc" },
        })
        return page.items
      }).pipe(withClickHouse(SessionRepositoryLive, clickhouse, organizationId)),
    )

    let recorded = 0
    let skipped = 0
    let noise = 0
    let assigned = 0
    for (const session of sessions) {
      const result = await Effect.runPromise(
        provideRuntime(
          recordSessionObservationUseCase({
            organizationId,
            projectId,
            sessionId: session.sessionId,
            triggeringTraceId: session.traceIds[0],
            triggeringStartTime: session.startTime.toISOString(),
            summaryStrategy: "embed_direct" satisfies TaxonomySummaryStrategy,
          }),
        ),
      )
      if (result.action === "recorded") {
        recorded++
        if (result.assignmentMethod === "noise") noise++
        else assigned++
      } else {
        skipped++
      }
    }

    if (args.rebaseObservationsToNow) {
      await clickhouse.command({
        query: `INSERT INTO behavior_observations
                SELECT
                  organization_id,
                  project_id,
                  session_id,
                  now64(9) - toIntervalSecond(rowNumberInAllBlocks()),
                  now64(9) - toIntervalSecond(rowNumberInAllBlocks()) + toIntervalSecond(60),
                  trace_ids,
                  summary,
                  summary_hash,
                  embedding,
                  embedding_model,
                  assigned_cluster_id,
                  assignment_confidence,
                  assignment_method,
                  reassignment_run_id,
                  retention_days,
                  now64(3)
                FROM behavior_observations FINAL
                WHERE organization_id = {organizationId:String}
                  AND project_id = {projectId:String}`,
        query_params: { organizationId, projectId },
      })
      await clickhouse.command({ query: "OPTIMIZE TABLE behavior_observations FINAL" })
    }

    const gardeningInput = args.gardenNow
      ? { organizationId, projectId, trigger: "manual" as const, now: args.gardenNow }
      : { organizationId, projectId, trigger: "manual" as const }
    const run = await Effect.runPromise(provideRuntime(runProjectGardeningUseCase(gardeningInput)))
    const clusters = await adminPostgres.pool.query(
      `SELECT id, name, observation_count, state
       FROM latitude.taxonomy_clusters
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY observation_count DESC
       LIMIT 20`,
      [organizationId, projectId],
    )
    const categories = await adminPostgres.pool.query(
      `SELECT id, name, cluster_count, state
       FROM latitude.taxonomy_categories
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY cluster_count DESC
       LIMIT 20`,
      [organizationId, projectId],
    )

    console.log(
      JSON.stringify(
        {
          thresholdPair: {
            link: TAXONOMY_BIRTH_LINK_THRESHOLD,
            maxDiameter: TAXONOMY_BIRTH_MAX_DIAMETER,
          },
          sessions: { selected: sessions.length, recorded, skipped, noise, assigned },
          run: {
            id: run.id,
            status: run.status,
            observationsScanned: run.observationsScanned,
            noiseScanned: run.noiseScanned,
            clustersBorn: run.clustersBorn,
            clustersMerged: run.clustersMerged,
            clustersDeprecated: run.clustersDeprecated,
            categoriesRebuilt: run.categoriesRebuilt,
            error: run.error,
          },
          clusters: clusters.rows,
          categories: categories.rows,
        },
        null,
        2,
      ),
    )
  } finally {
    await clickhouse.close()
    await postgres.pool.end()
    await adminPostgres.pool.end()
    redis.disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  console.error(usage())
  process.exit(1)
})
