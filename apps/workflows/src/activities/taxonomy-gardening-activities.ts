import { OrganizationId, ProjectId, TaxonomyClusterId, TaxonomyRunId } from "@domain/shared"
import {
  assertTaxonomyQualityUseCase,
  deprecateInactiveClustersUseCase,
  emitLineageUseCase,
  mergeNearDuplicateClustersUseCase,
  nameClusterUseCase,
  reassignNoiseToCurrentClustersUseCase,
  reconcileClusterCountsUseCase,
  recurseTreeClustersUseCase,
  sweepNoiseAndBirthClustersUseCase,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  type TaxonomyClusterLineage,
  TaxonomyClusterRepository,
  type TaxonomyDimension,
  TaxonomyObservationRepository,
  type TaxonomyRun,
  TaxonomyRunRepository,
} from "@domain/taxonomy"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import { RedisCacheStoreLive, RedisDistributedLockRepositoryLive } from "@platform/cache-redis"
import { TaxonomyObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("taxonomy-gardening-workflow")

export interface GardenTaxonomyActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly dimension: TaxonomyDimension
  readonly trigger: "cron" | "manual" | "threshold"
  readonly workflowId?: string
  /**
   * Temporal execution run id. The gardening workflow id is fixed per
   * project+dimension, so without this salt every execution derives the same
   * taxonomy run id and overwrites the previous run's history row.
   */
  readonly workflowRunId?: string
  readonly taxonomyRunId?: string
}

export interface GardenTaxonomyStepInput extends GardenTaxonomyActivityInput {
  readonly runId: string
  readonly now: string
}

export interface GardenTaxonomyCompleteInput extends GardenTaxonomyStepInput {
  readonly observationsScanned: number
  readonly noiseScanned: number
  readonly clustersBorn: number
  readonly clustersMerged: number
  readonly clustersDeprecated: number
}

export interface GardenTaxonomyFailInput extends GardenTaxonomyStepInput {
  readonly error: string
}

export interface GardenTaxonomyStartResult extends GardenTaxonomyStepInput {
  readonly observationsScanned: number
}

export interface GardenTaxonomyLineageResult {
  readonly lineage: readonly TaxonomyClusterLineage[]
}

export interface GardenTaxonomyNamingPlanResult {
  readonly clusterIds: readonly string[]
  readonly clustersScanned: number
}

export interface GardenTaxonomyQualityResult {
  readonly clustersScanned: number
  readonly findings: readonly string[]
}

export type GardenTaxonomyActivityResult = TaxonomyRun

const deterministicTaxonomyRunId = (input: GardenTaxonomyActivityInput) => {
  if (input.taxonomyRunId !== undefined) return TaxonomyRunId(input.taxonomyRunId.slice(0, 24).padEnd(24, "0"))
  const workflowSource = input.workflowId ?? `${input.organizationId}:${input.projectId}:${input.dimension}`
  // Salt with the Temporal execution run id so retries within one execution
  // stay idempotent but each new execution records its own taxonomy run row.
  const source = input.workflowRunId === undefined ? workflowSource : `${workflowSource}\0${input.workflowRunId}`
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0
  }
  return TaxonomyRunId(
    `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}${source.length.toString(16).padStart(8, "0")}`,
  )
}

const baseStepInput = (input: GardenTaxonomyActivityInput): GardenTaxonomyStepInput => {
  const workflowId =
    input.workflowId ?? `org:${input.organizationId}:taxonomy:garden:${input.projectId}:${input.dimension}`
  return {
    ...input,
    workflowId,
    runId: deterministicTaxonomyRunId({ ...input, workflowId }),
    now: new Date().toISOString(),
  }
}

const errorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string") {
    return error._tag
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const gardeningLookbackStart = (now: Date): Date =>
  new Date(now.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

const withTaxonomyPostgres = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withPostgres(
      Layer.mergeAll(TaxonomyClusterRepositoryLive, TaxonomyLineageRepositoryLive, TaxonomyRunRepositoryLive),
      getPostgresClient(),
      OrganizationId(organizationId),
    ),
  )

const withTaxonomyClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(withClickHouse(TaxonomyObservationRepositoryLive, getClickhouseClient(), OrganizationId(organizationId)))

const withTaxonomyAiAndRedis = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const redisClient = getRedisClient()
  return effect.pipe(
    withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), redisClient),
    Effect.provide(Layer.mergeAll(RedisCacheStoreLive(redisClient), RedisDistributedLockRepositoryLive(redisClient))),
  )
}

const runGardenStep = <A, E>(
  name: string,
  input: GardenTaxonomyStepInput | GardenTaxonomyActivityInput,
  effect: Effect.Effect<A, E, never>,
) => {
  const startedAt = Date.now()
  return Effect.runPromise(
    effect.pipe(
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info(`${name} completed`, {
            metric: "taxonomy.gardenTaxonomyWorkflow.activity",
            organizationId: input.organizationId,
            projectId: input.projectId,
            dimension: input.dimension,
            workflowId: "workflowId" in input ? input.workflowId : undefined,
            runId: "runId" in input ? input.runId : input.taxonomyRunId,
            durationMs: Date.now() - startedAt,
            result,
          }),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error(`${name} failed`, {
            metric: "taxonomy.gardenTaxonomyWorkflow.activity",
            organizationId: input.organizationId,
            projectId: input.projectId,
            dimension: input.dimension,
            workflowId: "workflowId" in input ? input.workflowId : undefined,
            runId: "runId" in input ? input.runId : input.taxonomyRunId,
            durationMs: Date.now() - startedAt,
            error,
          }),
        ),
      ),
      withTracing,
    ),
  )
}

export const startGardenTaxonomyRunActivity = (input: GardenTaxonomyActivityInput) => {
  const step = baseStepInput(input)
  const now = new Date(step.now)
  const run = {
    id: TaxonomyRunId(step.runId),
    organizationId: OrganizationId(step.organizationId),
    projectId: ProjectId(step.projectId),
    dimension: step.dimension,
    trigger: step.trigger,
    status: "running" as const,
    startedAt: now,
    completedAt: null,
    observationsScanned: 0,
    noiseScanned: 0,
    clustersBorn: 0,
    clustersMerged: 0,
    clustersDeprecated: 0,
    error: null,
  }
  return runGardenStep(
    "GardenTaxonomyWorkflow start run",
    step,
    Effect.gen(function* () {
      const runs = yield* TaxonomyRunRepository
      const observations = yield* TaxonomyObservationRepository
      yield* Effect.annotateCurrentSpan("taxonomy.workflowId", step.workflowId ?? "")
      yield* Effect.annotateCurrentSpan("taxonomy.runId", step.runId)
      yield* runs.save(run)
      const counts = yield* observations.getCounts({
        organizationId: run.organizationId,
        projectId: run.projectId,
        since: gardeningLookbackStart(now),
      })
      return { ...step, observationsScanned: counts.total } satisfies GardenTaxonomyStartResult
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, step.organizationId),
      (effect) => withTaxonomyClickHouse(effect, step.organizationId),
    ),
  )
}

export const sweepGardenTaxonomyNoiseActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow sweep noise",
    input,
    sweepNoiseAndBirthClustersUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
      withTaxonomyAiAndRedis,
    ),
  )

export const mergeGardenTaxonomyClustersActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow merge clusters",
    input,
    mergeNearDuplicateClustersUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
      withTaxonomyAiAndRedis,
    ),
  )

export const deprecateGardenTaxonomyClustersActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow deprecate clusters",
    input,
    deprecateInactiveClustersUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

export const reassignGardenTaxonomyNoiseActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow reassign noise",
    input,
    reassignNoiseToCurrentClustersUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
      withTaxonomyAiAndRedis,
    ),
  )

export const recurseGardenTaxonomyTreeActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow recurse tree",
    input,
    recurseTreeClustersUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
      withTaxonomyAiAndRedis,
    ),
  )

export const reconcileGardenTaxonomyCountsActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow reconcile counts",
    input,
    reconcileClusterCountsUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
      // Per-cluster saves take the distributed cluster lock to avoid clobbering
      // centroids that live online assignment mutates concurrently.
      (effect) => effect.pipe(Effect.provide(RedisDistributedLockRepositoryLive(getRedisClient()))),
    ),
  )

export const assertGardenTaxonomyQualityActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow assert quality",
    input,
    assertTaxonomyQualityUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      dimension: input.dimension,
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
    ),
  )

export const planGardenTaxonomyNamingActivity = (input: GardenTaxonomyStepInput & GardenTaxonomyLineageResult) =>
  runGardenStep(
    "GardenTaxonomyWorkflow plan naming",
    input,
    Effect.gen(function* () {
      const clusters = yield* TaxonomyClusterRepository
      const bornClusterIds = new Set(
        input.lineage.flatMap((row) =>
          row.transitionType === "birth" || row.transitionType === "split" ? row.toClusterIds : [],
        ),
      )
      const projectId = ProjectId(input.projectId)
      const activeClusters = yield* clusters.listActiveByProject({ projectId, dimension: input.dimension })
      return {
        clusterIds: activeClusters
          .filter((cluster) => bornClusterIds.has(cluster.id) || cluster.name === "Pending")
          .map((cluster) => cluster.id),
        clustersScanned: activeClusters.length,
      } satisfies GardenTaxonomyNamingPlanResult
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

export const nameGardenTaxonomyActivity = (input: GardenTaxonomyStepInput & GardenTaxonomyLineageResult) =>
  runGardenStep(
    "GardenTaxonomyWorkflow name taxonomy",
    input,
    Effect.gen(function* () {
      const plan = yield* Effect.promise(() => planGardenTaxonomyNamingActivity(input))
      const projectId = ProjectId(input.projectId)
      const organizationId = OrganizationId(input.organizationId)
      for (const clusterId of plan.clusterIds) {
        yield* nameClusterUseCase({
          organizationId,
          projectId,
          clusterId: TaxonomyClusterId(clusterId),
          now: new Date(input.now),
        })
      }
      return { ...plan, clustersNamed: plan.clusterIds.length }
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
      withTaxonomyAiAndRedis,
    ),
  )

export const emitGardenTaxonomyLineageActivity = (input: GardenTaxonomyStepInput & GardenTaxonomyLineageResult) =>
  runGardenStep(
    "GardenTaxonomyWorkflow emit lineage",
    input,
    emitLineageUseCase({ transitions: input.lineage }).pipe((effect) =>
      withTaxonomyPostgres(effect, input.organizationId),
    ),
  )

export const completeGardenTaxonomyRunActivity = (input: GardenTaxonomyCompleteInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow complete run",
    input,
    Effect.gen(function* () {
      const runs = yield* TaxonomyRunRepository
      const run: TaxonomyRun = {
        id: TaxonomyRunId(input.runId),
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        dimension: input.dimension,
        trigger: input.trigger,
        status: "completed",
        startedAt: new Date(input.now),
        completedAt: new Date(),
        observationsScanned: input.observationsScanned,
        noiseScanned: input.noiseScanned,
        clustersBorn: input.clustersBorn,
        clustersMerged: input.clustersMerged,
        clustersDeprecated: input.clustersDeprecated,
        error: null,
      }
      yield* runs.save(run)
      return run
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

export const failGardenTaxonomyRunActivity = (input: GardenTaxonomyFailInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow fail run",
    input,
    Effect.gen(function* () {
      const runs = yield* TaxonomyRunRepository
      const run: TaxonomyRun = {
        id: TaxonomyRunId(input.runId),
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        dimension: input.dimension,
        trigger: input.trigger,
        status: "failed",
        startedAt: new Date(input.now),
        completedAt: new Date(),
        observationsScanned: 0,
        noiseScanned: 0,
        clustersBorn: 0,
        clustersMerged: 0,
        clustersDeprecated: 0,
        error: input.error,
      }
      yield* runs.save(run)
      return run
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

export { errorMessage as gardenTaxonomyErrorMessage }
