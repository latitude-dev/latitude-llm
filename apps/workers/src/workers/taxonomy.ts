import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { CustomBehaviorId, OrganizationId, ProjectId } from "@domain/shared"
import {
  CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_GARDENING_SWEEP_SPREAD_MS,
  TAXONOMY_GARDENING_THROTTLE_MS,
  type TaxonomyObservationCounts,
  TaxonomyObservationRepository,
  taxonomyGardenCustomBehaviorDedupeKey,
  taxonomyGardenProjectDedupeKey,
} from "@domain/taxonomy"
import type { RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { TaxonomyObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  type GardenableCustomBehaviorRef,
  listGardenableCustomBehaviors,
  listGardenableProjectRefs,
  type PostgresClient,
} from "@platform/db-postgres"
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

interface GardenCustomBehaviorPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly customBehaviorId: string
  readonly reason?: "manual" | "cron"
}

interface GardenCustomBehaviorSweepPayload {
  /** Optional override for ad-hoc runs; the repeatable sweep anchors at execution time. */
  readonly triggeredAt?: string
}

interface TaxonomyRuntimeDeps {
  readonly clickhouseClient: ClickHouseClient
  readonly postgresClient: PostgresClient
  readonly redisClient: RedisClient
  readonly publisher?: QueuePublisherShape
  readonly workflowStarter?: WorkflowStarterShape
}

interface ActiveProjectRow {
  readonly organization_id: string
  readonly project_id: string
}

interface ObservationCountsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly since: Date
}

interface TaxonomySweepDeps {
  readonly listActiveProjects: () => Effect.Effect<readonly ActiveProjectRow[], unknown>
  readonly readObservationCounts: (input: ObservationCountsInput) => Effect.Effect<TaxonomyObservationCounts, unknown>
  readonly publisher: QueuePublisherShape
  readonly workflowStarter?: WorkflowStarterShape
}

interface CustomBehaviorSweepDeps {
  readonly listGardenableCustomBehaviors: (
    gardenedBefore: Date,
  ) => Effect.Effect<readonly GardenableCustomBehaviorRef[], unknown>
  readonly publisher: QueuePublisherShape
}

const lookbackStart = (triggeredAt: Date): Date =>
  new Date(triggeredAt.getTime() - TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 24 * 60 * 60_000)

const deterministicProjectDelayMs = (input: {
  readonly organizationId: string
  readonly projectId: string
}): number => {
  const source = `${input.organizationId}:${input.projectId}`
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash % TAXONOMY_GARDENING_SWEEP_SPREAD_MS
}

const listActiveProjects = (adminPostgresClient: PostgresClient) =>
  Effect.tryPromise({
    try: () => listGardenableProjectRefs(adminPostgresClient),
    catch: (cause) => cause,
  })

const listGardenableCustomBehaviorsEffect = (adminPostgresClient: PostgresClient, gardenedBefore: Date) =>
  Effect.tryPromise({
    try: () => listGardenableCustomBehaviors(adminPostgresClient, { gardenedBefore }),
    catch: (cause) => cause,
  })

const readObservationCounts = (clickhouseClient: ClickHouseClient, input: ObservationCountsInput) =>
  Effect.gen(function* () {
    const repo = yield* TaxonomyObservationRepository
    return yield* repo.getCounts(input)
  }).pipe(withClickHouse(TaxonomyObservationRepositoryLive, clickhouseClient, input.organizationId))

export const runGardenSweepJob = (payload: GardenSweepPayload, deps: TaxonomySweepDeps) =>
  Effect.gen(function* () {
    const triggeredAt = new Date(payload.triggeredAt)
    const since = lookbackStart(Number.isNaN(triggeredAt.getTime()) ? new Date() : triggeredAt)
    const projects = yield* deps.listActiveProjects()
    let attempted = 0
    let published = 0
    let failed = 0

    for (const project of projects) {
      attempted++
      const organizationId = OrganizationId(project.organization_id)
      const projectId = ProjectId(project.project_id)
      yield* Effect.gen(function* () {
        const counts = yield* deps.readObservationCounts({ organizationId, projectId, since })
        if (counts.total < TAXONOMY_GARDENING_MIN_OBSERVATIONS) return

        if (deps.workflowStarter) {
          const started = yield* deps.workflowStarter
            .start(
              "gardenTaxonomyWorkflow",
              { organizationId, projectId, dimension: "topic", trigger: "cron" },
              {
                workflowId: taxonomyGardenProjectDedupeKey({ organizationId, projectId }),
                startDelayMs: deterministicProjectDelayMs({ organizationId, projectId }),
              },
            )
            .pipe(
              Effect.as(true),
              Effect.catchTag("WorkflowAlreadyStartedError", () => Effect.succeed(false)),
            )
          if (!started) return
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

// Scoped analogue of runGardenSweepJob: enqueue a `gardenCustomBehavior` run
// (reason "cron") for each eligible custom behavior. Eligibility (live project,
// past the cadence throttle) is resolved in the admin query; the ≥15-observation
// gate and dedupe live in the per-behavior job + workflow, so this loop just
// fans out.
export const runGardenCustomBehaviorSweepJob = (
  payload: GardenCustomBehaviorSweepPayload,
  deps: CustomBehaviorSweepDeps,
) =>
  Effect.gen(function* () {
    // Anchor the throttle window at execution time. A repeatable job's payload is
    // frozen at scheduler-registration (worker boot), so trusting a payload
    // timestamp would freeze `gardenedBefore` and stall the sweep once behaviors
    // stamp a newer `last_gardened_at`; `triggeredAt` is honored only as an
    // explicit override for ad-hoc/manual invocations.
    const override = payload.triggeredAt ? new Date(payload.triggeredAt) : null
    const anchor = override && !Number.isNaN(override.getTime()) ? override : new Date()
    const gardenedBefore = new Date(anchor.getTime() - CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS)
    const behaviors = yield* deps.listGardenableCustomBehaviors(gardenedBefore)
    let published = 0
    let failed = 0

    for (const behavior of behaviors) {
      const organizationId = OrganizationId(behavior.organization_id)
      const customBehaviorId = CustomBehaviorId(behavior.custom_behavior_id)
      yield* Effect.gen(function* () {
        yield* deps.publisher.publish(
          "taxonomy",
          "gardenCustomBehavior",
          {
            organizationId: behavior.organization_id,
            projectId: behavior.project_id,
            customBehaviorId: behavior.custom_behavior_id,
            reason: "cron",
          },
          {
            dedupeKey: taxonomyGardenCustomBehaviorDedupeKey({ organizationId, customBehaviorId }),
            // TTL-based dedupe (not a retained jobId) so recurring sweeps keep
            // re-enqueueing this behavior instead of the first run shadowing the rest.
            leadingThrottleMs: CUSTOM_BEHAVIOR_GARDENING_MIN_INTERVAL_MS,
          },
        )
        published++
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            failed++
            logger.warn("Custom behavior gardening sweep enqueue failed", {
              organizationId,
              customBehaviorId,
              error,
            })
          }),
        ),
      )
    }

    logger.info("Custom behavior gardening sweep completed", { attempted: behaviors.length, published, failed })
  }).pipe(
    Effect.tapError((error) => Effect.sync(() => logger.error("Custom behavior gardening sweep failed", error))),
    withTracing,
    Effect.withSpan("taxonomy.gardenCustomBehaviorSweep"),
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

// On-demand scoped regeneration for one custom behavior, driven by an explicit
// enqueue rather than a cron sweep (scoped trees are regenerated on request).
// Dedupe on the behavior so concurrent triggers collapse.
export const runGardenCustomBehaviorJob = (payload: GardenCustomBehaviorPayload, deps: TaxonomyRuntimeDeps) => {
  if (!deps.workflowStarter) {
    return Effect.sync(() =>
      logger.error("Custom behavior gardening skipped: no Temporal workflow starter configured", {
        metric: "taxonomy.gardenCustomBehavior",
        outcome: "skipped",
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        customBehaviorId: payload.customBehaviorId,
      }),
    ).pipe(withTracing, Effect.withSpan("taxonomy.gardenCustomBehavior"), Effect.asVoid)
  }

  const workflowId = taxonomyGardenCustomBehaviorDedupeKey({
    organizationId: OrganizationId(payload.organizationId),
    customBehaviorId: CustomBehaviorId(payload.customBehaviorId),
  })
  // The unified gardenTaxonomyWorkflow does the scoped run when it carries a
  // customBehaviorId; the start activity loads the behavior's FilterSet.
  return deps.workflowStarter
    .start(
      "gardenTaxonomyWorkflow",
      {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        dimension: "topic",
        customBehaviorId: payload.customBehaviorId,
        trigger: payload.reason ?? "manual",
      },
      { workflowId },
    )
    .pipe(
      Effect.tap(() =>
        Effect.sync(() =>
          logger.info("Started GardenTaxonomyWorkflow (scoped)", {
            metric: "taxonomy.gardenCustomBehavior.workflowStart",
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            customBehaviorId: payload.customBehaviorId,
            workflowId,
          }),
        ),
      ),
      Effect.catchTag("WorkflowAlreadyStartedError", () =>
        Effect.sync(() =>
          logger.info("GardenTaxonomyWorkflow (scoped) already running", {
            metric: "taxonomy.gardenCustomBehavior.workflowStart",
            outcome: "already_running",
            organizationId: payload.organizationId,
            customBehaviorId: payload.customBehaviorId,
            workflowId,
          }),
        ),
      ),
      withTracing,
      Effect.withSpan("taxonomy.gardenCustomBehavior.startWorkflow"),
      Effect.asVoid,
    )
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
        listActiveProjects: () => listActiveProjects(adminPostgresClient),
        readObservationCounts: (input) => readObservationCounts(clickhouseClient, input),
        publisher,
        workflowStarter,
      }),
    gardenCustomBehavior: (payload) =>
      runGardenCustomBehaviorJob(payload as GardenCustomBehaviorPayload, {
        clickhouseClient,
        postgresClient,
        redisClient,
        publisher,
        workflowStarter,
      }),
    gardenCustomBehaviorSweep: (payload) =>
      runGardenCustomBehaviorSweepJob(payload as GardenCustomBehaviorSweepPayload, {
        listGardenableCustomBehaviors: (gardenedBefore) =>
          listGardenableCustomBehaviorsEffect(adminPostgresClient, gardenedBefore),
        publisher,
      }),
  })
}
