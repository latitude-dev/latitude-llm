import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  BehaviorObservationRepository,
  recordSessionObservationUseCase,
  runProjectGardeningUseCase,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_THROTTLE_MS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TaxonomyClusterRepository,
  TaxonomyRunRepository,
  taxonomyGardenProjectDedupeKey,
} from "@domain/taxonomy"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import { RedisCacheStoreLive, type RedisClient, RedisTaxonomyLockRepositoryLive } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import {
  BehaviorObservationRepositoryLive,
  SessionRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  TaxonomyCategoryRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("taxonomy")

interface TaxonomyDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly clickhouseClient: ClickHouseClient
  readonly postgresClient: PostgresClient
  readonly adminPostgresClient: PostgresClient
  readonly redisClient: RedisClient
}

interface GardenSweepPayload {
  readonly triggeredAt: string
}

interface GardenProjectPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly reason: "cron" | "manual" | "threshold"
}

interface ObserveSessionPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly triggeringTraceId: string
  readonly triggeringStartTime: string
}

export const runObserveSessionJob = (payload: ObserveSessionPayload, deps: TaxonomyRuntimeDeps) => {
  const startedAt = Date.now()
  return recordSessionObservationUseCase(payload).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        logger.info("Taxonomy session observation completed", {
          metric: "taxonomy.observeSession",
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          sessionId: payload.sessionId,
          outcome:
            result.action === "recorded"
              ? result.assignmentMethod === "centroid_online"
                ? "assigned"
                : "noise"
              : result.reason === "empty-session"
                ? "skip_too_short"
                : result.reason,
          durationMs: Date.now() - startedAt,
          confidence: result.action === "recorded" ? result.confidence : null,
          confidenceMetric: result.action === "recorded" ? "taxonomy.observeSession.confidence" : null,
          result,
        })
      }),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => {
        logger.error("Taxonomy session observation failed", {
          metric: "taxonomy.observeSession",
          outcome: "error",
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          sessionId: payload.sessionId,
          durationMs: Date.now() - startedAt,
          error,
        })
      }),
    ),
    withPostgres(
      Layer.mergeAll(
        TaxonomyCategoryRepositoryLive,
        TaxonomyClusterRepositoryLive,
        TaxonomyLineageRepositoryLive,
        TaxonomyRunRepositoryLive,
      ),
      deps.postgresClient,
      OrganizationId(payload.organizationId),
    ),
    withClickHouse(
      Layer.mergeAll(BehaviorObservationRepositoryLive, SessionRepositoryLive, TraceRepositoryLive),
      deps.clickhouseClient,
      OrganizationId(payload.organizationId),
    ),
    withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), deps.redisClient),
    Effect.provide(
      Layer.mergeAll(RedisCacheStoreLive(deps.redisClient), RedisTaxonomyLockRepositoryLive(deps.redisClient)),
    ),
    withTracing,
    Effect.withSpan("taxonomy.observeSession"),
    Effect.orElseSucceed(() => undefined),
    Effect.asVoid,
  )
}

interface TaxonomyRuntimeDeps {
  readonly clickhouseClient: ClickHouseClient
  readonly postgresClient: PostgresClient
  readonly redisClient: RedisClient
}

interface TaxonomySweepDeps {
  readonly clickhouseClient: ClickHouseClient
  readonly adminPostgresClient: PostgresClient
  readonly publisher: QueuePublisherShape
}

const lookbackStart = (triggeredAt: Date): Date =>
  new Date(triggeredAt.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

const listActiveProjects = (adminPostgresClient: PostgresClient) =>
  Effect.tryPromise({
    try: async () => {
      const result = await adminPostgresClient.pool.query<{
        readonly organization_id: string
        readonly project_id: string
      }>(`SELECT organization_id, id AS project_id FROM projects WHERE deleted_at IS NULL`)
      return result.rows
    },
    catch: (cause) => cause,
  })

export const runGardenSweepJob = (payload: GardenSweepPayload, deps: TaxonomySweepDeps) =>
  Effect.gen(function* () {
    const triggeredAt = new Date(payload.triggeredAt)
    const since = lookbackStart(Number.isNaN(triggeredAt.getTime()) ? new Date() : triggeredAt)
    const projects = yield* listActiveProjects(deps.adminPostgresClient)
    let attempted = 0
    let published = 0
    let failed = 0

    for (const project of projects) {
      attempted++
      const organizationId = OrganizationId(project.organization_id)
      const projectId = ProjectId(project.project_id)
      yield* Effect.gen(function* () {
        const counts = yield* Effect.gen(function* () {
          const repo = yield* BehaviorObservationRepository
          return yield* repo.getCounts({ organizationId, projectId, since })
        }).pipe(withClickHouse(BehaviorObservationRepositoryLive, deps.clickhouseClient, organizationId))
        if (counts.total < TAXONOMY_GARDENING_MIN_OBSERVATIONS) return

        yield* deps.publisher.publish(
          "taxonomy",
          "gardenProject",
          { organizationId, projectId, reason: "cron" },
          {
            dedupeKey: taxonomyGardenProjectDedupeKey({ organizationId, projectId }),
            throttleMs: TAXONOMY_GARDENING_THROTTLE_MS,
          },
        )
        published++
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            failed++
            logger.warn("Taxonomy gardening sweep project failed", { organizationId, projectId, error })
          }),
        ),
      )
    }

    logger.info("Taxonomy gardening sweep completed", { attempted, published, failed })
  }).pipe(
    Effect.tapError((error) => Effect.sync(() => logger.error("Taxonomy gardening sweep failed", error))),
    withTracing,
    Effect.withSpan("taxonomy.gardenSweep"),
    Effect.orElseSucceed(() => undefined),
    Effect.asVoid,
  )

export const runGardenProjectJob = (payload: GardenProjectPayload, deps: TaxonomyRuntimeDeps) =>
  runProjectGardeningUseCase({
    organizationId: OrganizationId(payload.organizationId),
    projectId: ProjectId(payload.projectId),
    trigger: payload.reason,
  }).pipe(
    Effect.tap((run) =>
      Effect.gen(function* () {
        const runs = yield* TaxonomyRunRepository
        const clusters = yield* TaxonomyClusterRepository
        const recent = yield* runs.listRecentCompleted({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
          limit: 3,
        })
        const observations = yield* BehaviorObservationRepository
        const counts = yield* observations.getCounts({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
          since: lookbackStart(new Date()),
        })
        const zeroBirthsStreak =
          counts.total >= TAXONOMY_GARDENING_MIN_OBSERVATIONS &&
          recent.length >= 3 &&
          recent.every((row) => row.clustersBorn === 0 && row.noiseScanned > 0)
        const activeClusters = yield* clusters.listActiveByProject({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
        })
        const deprecatedClusters = yield* clusters.list({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
          state: "deprecated",
          limit: 10_000,
          offset: 0,
        })
        logger.info("Taxonomy gardening completed", {
          metric: "taxonomy.gardenProject",
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          runId: run.id,
          durationMs: run.completedAt ? run.completedAt.getTime() - run.startedAt.getTime() : null,
          observationsScanned: run.observationsScanned,
          noiseScanned: run.noiseScanned,
          clustersBorn: run.clustersBorn,
          clustersMerged: run.clustersMerged,
          clustersDeprecated: run.clustersDeprecated,
          categoriesRebuilt: run.categoriesRebuilt,
          result: run,
        })
        logger.info("Taxonomy cluster counts refreshed", {
          metric: "taxonomy.cluster.count",
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          countActive: activeClusters.length,
          countDeprecated: deprecatedClusters.items.length,
        })
        if (zeroBirthsStreak) {
          logger.warn("Taxonomy zero births streak", {
            metric: "taxonomy.zero_births_streak",
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            observationCountInWindow: counts.total,
            runs: recent.map((row) => row.id),
            noiseScanned: recent.map((row) => row.noiseScanned),
          })
        }
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() =>
            logger.warn("Taxonomy gardening observability failed", {
              metric: "taxonomy.gardenProject.observability",
              error,
            }),
          ),
        ),
      ),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => {
        logger.error("Taxonomy gardening failed", {
          metric: "taxonomy.gardenProject",
          outcome: "error",
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          error,
        })
      }),
    ),
    withPostgres(
      Layer.mergeAll(
        TaxonomyCategoryRepositoryLive,
        TaxonomyClusterRepositoryLive,
        TaxonomyLineageRepositoryLive,
        TaxonomyRunRepositoryLive,
      ),
      deps.postgresClient,
      OrganizationId(payload.organizationId),
    ),
    withClickHouse(
      Layer.mergeAll(BehaviorObservationRepositoryLive),
      deps.clickhouseClient,
      OrganizationId(payload.organizationId),
    ),
    withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), deps.redisClient),
    Effect.provide(
      Layer.mergeAll(RedisCacheStoreLive(deps.redisClient), RedisTaxonomyLockRepositoryLive(deps.redisClient)),
    ),
    withTracing,
    Effect.withSpan("taxonomy.gardenProject"),
    Effect.orElseSucceed(() => undefined),
    Effect.asVoid,
  )

export const createTaxonomyWorker = ({
  consumer,
  publisher,
  clickhouseClient,
  postgresClient,
  adminPostgresClient,
  redisClient,
}: TaxonomyDeps) => {
  consumer.subscribe("taxonomy", {
    gardenProject: (payload) =>
      runGardenProjectJob(payload as GardenProjectPayload, {
        clickhouseClient,
        postgresClient,
        redisClient,
      }),
    gardenSweep: (payload) =>
      runGardenSweepJob(payload as GardenSweepPayload, {
        clickhouseClient,
        adminPostgresClient,
        publisher,
      }),
    observeSession: (payload) =>
      runObserveSessionJob(payload as ObserveSessionPayload, {
        clickhouseClient,
        postgresClient,
        redisClient,
      }),
  })
}
