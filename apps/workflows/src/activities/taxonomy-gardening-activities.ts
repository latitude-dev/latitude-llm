import { generateId, OrganizationId, ProjectId, TaxonomyRunId } from "@domain/shared"
import {
  BehaviorObservationRepository,
  deprecateInactiveClustersUseCase,
  emitLineageUseCase,
  mergeNearDuplicateClustersUseCase,
  reassignNoiseToCurrentClustersUseCase,
  rebuildCategoryHierarchyUseCase,
  sweepNoiseAndBirthClustersUseCase,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TaxonomyCategoryRepository,
  TaxonomyClusterRepository,
  type TaxonomyRun,
  TaxonomyRunRepository,
  type TaxonomyRunTrigger,
} from "@domain/taxonomy"
import { RedisDistributedLockRepositoryLive } from "@platform/cache-redis"
import { BehaviorObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  TaxonomyCategoryRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

// ---------------------------------------------------------------------------
// Shared layer wiring
//
// Structural gardening stages touch Postgres (clusters/categories/lineage/runs)
// + ClickHouse (observations) and acquire the per-cluster Redis lock. They do
// NOT call the AI provider — naming is delegated to the existing
// `taxonomyName*Workflow` child workflows, so no AI layer is wired here.
// ---------------------------------------------------------------------------

const provideGardeningLayers = <A, E, R>(organizationId: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    withPostgres(
      Layer.mergeAll(
        TaxonomyCategoryRepositoryLive,
        TaxonomyClusterRepositoryLive,
        TaxonomyLineageRepositoryLive,
        TaxonomyRunRepositoryLive,
      ),
      getPostgresClient(),
      OrganizationId(organizationId),
    ),
    withClickHouse(BehaviorObservationRepositoryLive, getClickhouseClient(), OrganizationId(organizationId)),
    Effect.provide(RedisDistributedLockRepositoryLive(getRedisClient())),
  )

const gardeningLookbackStart = (now: Date): Date =>
  new Date(now.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

// Result of an activity whose use-case can lose the per-cluster lock race. The
// workflow retries `lock-unavailable` via durable sleeps (`runWithLockRetry`).
export type LockableActivityResult<T> = ({ readonly status: "ok" } & T) | { readonly status: "lock-unavailable" }

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface GardenStageActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly runId: string
  /** Workflow-pinned "now" (ISO) so retries/replays share one timeline anchor. */
  readonly nowIso: string
}

export interface StartGardenRunActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly trigger: TaxonomyRunTrigger
  readonly nowIso: string
}

export interface CompleteGardenRunActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly runId: string
  readonly nowIso: string
  readonly noiseScanned: number
  readonly clustersBorn: number
  readonly clustersMerged: number
  readonly clustersDeprecated: number
  readonly categoriesRebuilt: number
}

export interface FailGardenRunActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly runId: string
  readonly error: string
}

// ---------------------------------------------------------------------------
// Run lifecycle activities
// ---------------------------------------------------------------------------

const buildRunRow = (input: StartGardenRunActivityInput, runId: TaxonomyRunId): TaxonomyRun => ({
  id: runId,
  organizationId: OrganizationId(input.organizationId),
  projectId: ProjectId(input.projectId),
  trigger: input.trigger,
  status: "running",
  startedAt: new Date(input.nowIso),
  completedAt: null,
  observationsScanned: 0,
  noiseScanned: 0,
  clustersBorn: 0,
  clustersMerged: 0,
  clustersDeprecated: 0,
  categoriesRebuilt: 0,
  error: null,
})

/**
 * Insert the `running` taxonomy_runs row and return its id. Idempotency: a
 * lost completion-ack retry can insert a second `running` row; the
 * stale-run/eligibility gate (`listRunning` + `TAXONOMY_GARDENING_STALE_GRACE_MS`)
 * reaps orphans, so a rare duplicate is accepted for v1 (the same norm as
 * seed-demo-project-workflow's half-applied note).
 */
export const startGardenRunActivity = (input: StartGardenRunActivityInput): Promise<string> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      Effect.gen(function* () {
        const runId = TaxonomyRunId(generateId())
        const runs = yield* TaxonomyRunRepository
        yield* runs.insert(buildRunRow(input, runId))
        return runId as string
      }),
    ),
  )

// Births create new clusters and absorb candidates; they take no per-cluster
// lock, so this stage is not lockable.
export const sweepNoiseAndBirthActivity = (
  input: GardenStageActivityInput,
): Promise<{ readonly noiseScanned: number; readonly clustersBorn: number }> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      sweepNoiseAndBirthClustersUseCase({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        runId: TaxonomyRunId(input.runId),
        now: new Date(input.nowIso),
      }).pipe(
        Effect.flatMap((result) =>
          emitLineageUseCase({ transitions: result.lineage }).pipe(
            Effect.as({ noiseScanned: result.noiseScanned, clustersBorn: result.clustersBorn }),
          ),
        ),
      ),
    ),
  )

export const mergeClustersActivity = (
  input: GardenStageActivityInput,
): Promise<LockableActivityResult<{ readonly clustersMerged: number }>> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      mergeNearDuplicateClustersUseCase({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        runId: TaxonomyRunId(input.runId),
        now: new Date(input.nowIso),
      }).pipe(
        Effect.flatMap((result) =>
          emitLineageUseCase({ transitions: result.lineage }).pipe(
            Effect.as({ status: "ok" as const, clustersMerged: result.clustersMerged }),
          ),
        ),
        Effect.catchTag("TaxonomyClusterLockUnavailableError", () =>
          Effect.succeed({ status: "lock-unavailable" as const }),
        ),
      ),
    ),
  )

export const deprecateInactiveActivity = (
  input: GardenStageActivityInput,
): Promise<{ readonly clustersDeprecated: number }> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      deprecateInactiveClustersUseCase({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        runId: TaxonomyRunId(input.runId),
        now: new Date(input.nowIso),
      }).pipe(
        Effect.flatMap((result) =>
          emitLineageUseCase({ transitions: result.lineage }).pipe(
            Effect.as({ clustersDeprecated: result.clustersDeprecated }),
          ),
        ),
      ),
    ),
  )

export const reassignNoiseActivity = (
  input: GardenStageActivityInput,
): Promise<LockableActivityResult<{ readonly noiseScanned: number }>> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      reassignNoiseToCurrentClustersUseCase({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        runId: TaxonomyRunId(input.runId),
        now: new Date(input.nowIso),
      }).pipe(
        Effect.map((result) => ({ status: "ok" as const, noiseScanned: result.noiseScanned })),
        Effect.catchTag("TaxonomyClusterLockUnavailableError", () =>
          Effect.succeed({ status: "lock-unavailable" as const }),
        ),
      ),
    ),
  )

export const rebuildHierarchyActivity = (
  input: GardenStageActivityInput,
): Promise<{ readonly categoriesRebuilt: number }> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      rebuildCategoryHierarchyUseCase({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        now: new Date(input.nowIso),
      }).pipe(Effect.map((result) => ({ categoriesRebuilt: result.categoriesRebuilt }))),
    ),
  )

export const completeGardenRunActivity = (input: CompleteGardenRunActivityInput): Promise<void> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      Effect.gen(function* () {
        const now = new Date(input.nowIso)
        const observations = yield* BehaviorObservationRepository
        const observationCounts = yield* observations.getCounts({
          organizationId: OrganizationId(input.organizationId),
          projectId: ProjectId(input.projectId),
          since: gardeningLookbackStart(now),
        })
        const runs = yield* TaxonomyRunRepository
        const run = yield* runs.findById(TaxonomyRunId(input.runId))
        yield* runs.save({
          ...run,
          status: "completed",
          completedAt: new Date(),
          observationsScanned: observationCounts.total,
          noiseScanned: input.noiseScanned,
          clustersBorn: input.clustersBorn,
          clustersMerged: input.clustersMerged,
          clustersDeprecated: input.clustersDeprecated,
          categoriesRebuilt: input.categoriesRebuilt,
        })
      }).pipe(Effect.catchTag("NotFoundError", () => Effect.void)),
    ),
  )

export const failGardenRunActivity = (input: FailGardenRunActivityInput): Promise<void> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      Effect.gen(function* () {
        const runs = yield* TaxonomyRunRepository
        const run = yield* runs.findById(TaxonomyRunId(input.runId))
        yield* runs.save({ ...run, status: "failed", completedAt: new Date(), error: input.error })
      }).pipe(Effect.catchTag("NotFoundError", () => Effect.void)),
    ),
  )

// ---------------------------------------------------------------------------
// Sweep fan-out support
// ---------------------------------------------------------------------------

export interface EligibleProject {
  readonly organizationId: string
  readonly projectId: string
}

export interface PendingNamingTargets {
  readonly clusterIds: readonly string[]
  readonly categoryIds: readonly string[]
}

/**
 * Active clusters/categories still named "Pending". The workflow starts the
 * existing `taxonomyName*Workflow` child workflows for each — naming is no
 * longer done inline in gardening.
 */
export const listPendingNamingTargetsActivity = (input: {
  readonly organizationId: string
  readonly projectId: string
}): Promise<PendingNamingTargets> =>
  Effect.runPromise(
    provideGardeningLayers(
      input.organizationId,
      Effect.gen(function* () {
        const clusters = yield* TaxonomyClusterRepository
        const categories = yield* TaxonomyCategoryRepository
        const activeClusters = yield* clusters.listActiveByProject({ projectId: ProjectId(input.projectId) })
        const activeCategories = yield* categories.listByProject({ projectId: ProjectId(input.projectId), state: "active" })
        return {
          clusterIds: activeClusters.filter((cluster) => cluster.name === "Pending").map((cluster) => cluster.id as string),
          categoryIds: activeCategories
            .filter((category) => category.name === "Pending")
            .map((category) => category.id as string),
        }
      }),
    ),
  )

/**
 * Enumerate non-deleted projects whose recent observation count clears the
 * cold-start gate. Mirrors the retired BullMQ `gardenSweep` job: admin-scoped
 * project list, then a per-project org-scoped ClickHouse count.
 */
export const listEligibleProjectsActivity = (input: { readonly nowIso: string }): Promise<readonly EligibleProject[]> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const since = gardeningLookbackStart(new Date(input.nowIso))
      const rows = yield* Effect.tryPromise({
        try: async () => {
          const result = await getAdminPostgresClient().pool.query<{
            readonly organization_id: string
            readonly project_id: string
          }>(`SELECT organization_id, id AS project_id FROM latitude.projects WHERE deleted_at IS NULL`)
          return result.rows
        },
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      })

      const eligible: EligibleProject[] = []
      for (const row of rows) {
        const organizationId = OrganizationId(row.organization_id)
        const projectId = ProjectId(row.project_id)
        const counts = yield* Effect.gen(function* () {
          const repo = yield* BehaviorObservationRepository
          return yield* repo.getCounts({ organizationId, projectId, since })
        }).pipe(withClickHouse(BehaviorObservationRepositoryLive, getClickhouseClient(), organizationId))
        if (counts.total >= TAXONOMY_GARDENING_MIN_OBSERVATIONS) {
          eligible.push({ organizationId: row.organization_id, projectId: row.project_id })
        }
      }
      return eligible
    }),
  )
