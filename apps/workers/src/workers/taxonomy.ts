import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_THROTTLE_MS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TaxonomyObservationRepository,
  taxonomyGardenProjectDedupeKey,
} from "@domain/taxonomy"
import type { RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { TaxonomyObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("taxonomy")

interface TaxonomyDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly workflowStarter: WorkflowStarterShape
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

interface TaxonomyRuntimeDeps {
  readonly clickhouseClient: ClickHouseClient
  readonly postgresClient: PostgresClient
  readonly redisClient: RedisClient
  readonly publisher?: QueuePublisherShape
  readonly workflowStarter?: WorkflowStarterShape
}

interface TaxonomySweepDeps {
  readonly clickhouseClient: ClickHouseClient
  readonly adminPostgresClient: PostgresClient
  readonly publisher: QueuePublisherShape
  readonly workflowStarter?: WorkflowStarterShape
}

const lookbackStart = (triggeredAt: Date): Date =>
  new Date(triggeredAt.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

const listActiveProjects = (adminPostgresClient: PostgresClient) =>
  Effect.tryPromise({
    try: async () => {
      const result = await adminPostgresClient.pool.query<{
        readonly organization_id: string
        readonly project_id: string
      }>(`SELECT organization_id, id AS project_id FROM latitude.projects WHERE deleted_at IS NULL`)
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
          const repo = yield* TaxonomyObservationRepository
          return yield* repo.getCounts({ organizationId, projectId, since })
        }).pipe(withClickHouse(TaxonomyObservationRepositoryLive, deps.clickhouseClient, organizationId))
        if (counts.total < TAXONOMY_GARDENING_MIN_OBSERVATIONS) return

        if (deps.workflowStarter) {
          yield* deps.workflowStarter.start(
            "gardenTaxonomyWorkflow",
            { organizationId, projectId, dimension: "topic", trigger: "cron" },
            { workflowId: taxonomyGardenProjectDedupeKey({ organizationId, projectId }) },
          )
        } else {
          yield* deps.publisher.publish(
            "taxonomy",
            "gardenProject",
            { organizationId, projectId, reason: "cron" },
            {
              dedupeKey: taxonomyGardenProjectDedupeKey({ organizationId, projectId }),
              throttleMs: TAXONOMY_GARDENING_THROTTLE_MS,
            },
          )
        }
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
    Effect.asVoid,
  )

export const runGardenProjectJob = (payload: GardenProjectPayload, deps: TaxonomyRuntimeDeps) => {
  if (deps.workflowStarter) {
    const workflowId = `org:${payload.organizationId}:taxonomy:garden:${payload.projectId}`
    return deps.workflowStarter
      .start(
        "gardenTaxonomyWorkflow",
        {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          dimension: "topic",
          trigger: payload.reason,
        },
        { workflowId },
      )
      .pipe(
        Effect.tap(() =>
          Effect.sync(() =>
            logger.info("Started GardenTaxonomyWorkflow", {
              metric: "taxonomy.gardenProject.workflowStart",
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              workflowId,
            }),
          ),
        ),
        withTracing,
        Effect.withSpan("taxonomy.gardenProject.startWorkflow"),
        Effect.asVoid,
      )
  }

  // The Temporal workflow is the only gardening orchestrator; without a
  // workflow starter the job is a misconfiguration, not a fallback path.
  return Effect.sync(() =>
    logger.error("Taxonomy gardening skipped: no Temporal workflow starter configured", {
      metric: "taxonomy.gardenProject",
      outcome: "skipped",
      organizationId: payload.organizationId,
      projectId: payload.projectId,
    }),
  ).pipe(withTracing, Effect.withSpan("taxonomy.gardenProject"), Effect.asVoid)
}

export const createTaxonomyWorker = ({
  consumer,
  publisher,
  clickhouseClient,
  postgresClient,
  adminPostgresClient,
  redisClient,
  workflowStarter,
}: TaxonomyDeps) => {
  consumer.subscribe("taxonomy", {
    gardenProject: (payload) =>
      runGardenProjectJob(payload as GardenProjectPayload, {
        clickhouseClient,
        postgresClient,
        redisClient,
        publisher,
        workflowStarter,
      }),
    gardenSweep: (payload) =>
      runGardenSweepJob(payload as GardenSweepPayload, {
        clickhouseClient,
        adminPostgresClient,
        publisher,
        workflowStarter,
      }),
  })
}
