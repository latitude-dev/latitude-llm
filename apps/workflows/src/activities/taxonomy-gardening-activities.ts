import { OrganizationId, ProjectId, TaxonomyClusterId, TaxonomyRunId } from "@domain/shared"
import {
  assertTaxonomyQualityUseCase,
  buildHierarchicalTaxonomyUseCase,
  emitLineageUseCase,
  isDisplayableTaxonomyName,
  nameClusterUseCase,
  planHierarchicalTaxonomyUseCase,
  type ReassignTaxonomyObservationByIdInput,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  type TaxonomyCluster,
  type TaxonomyClusterLineage,
  TaxonomyClusterRepository,
  type TaxonomyDimension,
  TaxonomyObservationRepository,
  type TaxonomyRun,
  TaxonomyRunRepository,
} from "@domain/taxonomy"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { RedisCacheStoreLive, RedisDistributedLockRepositoryLive } from "@platform/cache-redis"
import { TaxonomyObservationRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { buildHierarchicalClustersInWorker } from "./taxonomy-clustering-worker.ts"

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
  readonly observationsAvailable: number
  readonly observationsSampled: number
  readonly sampleStrategy: string
  readonly sampleCap: number
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
  readonly observationsAvailable: number
  readonly observationsSampled: number
  readonly sampleStrategy: string
  readonly sampleCap: number
}

export interface GardenTaxonomyLineageResult {
  readonly lineage: readonly TaxonomyClusterLineage[]
}

export interface GardenTaxonomyBuildPlanResult extends GardenTaxonomyLineageResult {
  readonly observationsScanned: number
  readonly observationsAvailable: number
  readonly observationsSampled: number
  readonly sampleStrategy: string
  readonly sampleCap: number
  readonly clustersBorn: number
  readonly clustersContinued: number
  readonly clustersDeprecated: number
  readonly leavesAssigned: number
  readonly maxDepthReached: number
  readonly planKey: string
}

export interface GardenTaxonomyPlanReferenceInput extends GardenTaxonomyStepInput {
  readonly planKey: string
}

export type GardenTaxonomySaveClustersInput = GardenTaxonomyPlanReferenceInput
export type GardenTaxonomyReassignObservationsInput = GardenTaxonomyPlanReferenceInput
export type GardenTaxonomyDeprecateClustersInput = GardenTaxonomyPlanReferenceInput

interface StoredGardenTaxonomyPlan {
  readonly clusters: readonly TaxonomyCluster[]
  readonly observationAssignments: readonly ReassignTaxonomyObservationByIdInput[]
  readonly deprecatedClusterIds: readonly string[]
}

export interface GardenTaxonomyNamingPlanResult {
  readonly clusterIds: readonly string[]
  /**
   * Cluster ids grouped by tree depth, deepest first. Interior naming
   * depends on its children already having stable names, so the workflow
   * must process one depth at a time. Same data as `clusterIds`,
   * partitioned so the workflow can batch and await per depth.
   */
  readonly clusterIdsByDepth: ReadonlyArray<{ readonly depth: number; readonly clusterIds: readonly string[] }>
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

const TAXONOMY_GARDENING_PLAN_TTL_SECONDS = 14 * 24 * 60 * 60

const gardenTaxonomyPlanKey = (input: GardenTaxonomyStepInput): string =>
  `org:${input.organizationId}:taxonomy:gardenPlan:${input.runId}`

const storeGardenTaxonomyPlan = (input: GardenTaxonomyStepInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.tryPromise({
    try: async () => {
      const key = gardenTaxonomyPlanKey(input)
      await getRedisClient().set(key, JSON.stringify(plan), "EX", TAXONOMY_GARDENING_PLAN_TTL_SECONDS)
      return key
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })

class TaxonomyGardeningPlanMissingError extends Data.TaggedError("TaxonomyGardeningPlanMissingError")<{
  readonly message: string
}> {}

const loadGardenTaxonomyPlan = (input: GardenTaxonomyPlanReferenceInput) =>
  Effect.gen(function* () {
    const value = yield* Effect.tryPromise({
      try: () => getRedisClient().get(input.planKey),
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    })
    if (value === null) {
      return yield* new TaxonomyGardeningPlanMissingError({
        message: `Missing taxonomy gardening plan artifact: ${input.planKey}`,
      })
    }
    return JSON.parse(value) as StoredGardenTaxonomyPlan
  })

const reviveDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))

const reviveCluster = (cluster: TaxonomyCluster): TaxonomyCluster => ({
  ...cluster,
  firstObservedAt: reviveDate(cluster.firstObservedAt),
  lastObservedAt: reviveDate(cluster.lastObservedAt),
  clusteredAt: reviveDate(cluster.clusteredAt),
  createdAt: reviveDate(cluster.createdAt),
  updatedAt: reviveDate(cluster.updatedAt),
})

const reviveLineage = (lineage: TaxonomyClusterLineage): TaxonomyClusterLineage => ({
  ...lineage,
  createdAt: reviveDate(lineage.createdAt),
})

const reviveAssignment = (assignment: ReassignTaxonomyObservationByIdInput): ReassignTaxonomyObservationByIdInput => ({
  ...assignment,
  indexedAt: reviveDate(assignment.indexedAt),
})

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
    observationsAvailable: 0,
    observationsSampled: 0,
    sampleStrategy: TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
    sampleCap: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
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
      return {
        ...step,
        observationsScanned: counts.total,
        observationsAvailable: counts.total,
        observationsSampled: 0,
        sampleStrategy: TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
        sampleCap: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
      } satisfies GardenTaxonomyStartResult
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, step.organizationId),
      (effect) => withTaxonomyClickHouse(effect, step.organizationId),
    ),
  )
}

export const buildHierarchicalGardenTaxonomyActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow build hierarchical tree",
    input,
    buildHierarchicalTaxonomyUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
      now: new Date(input.now),
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
      withTaxonomyAiAndRedis,
    ),
  )

export const planHierarchicalGardenTaxonomyActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow plan hierarchical tree",
    input,
    planHierarchicalTaxonomyUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
      now: new Date(input.now),
      clusterBuilder: (builderInput) =>
        Effect.tryPromise({
          try: () => buildHierarchicalClustersInWorker(builderInput),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }),
    }).pipe(
      Effect.flatMap((plan) =>
        Effect.gen(function* () {
          const planKey = yield* storeGardenTaxonomyPlan(input, {
            clusters: plan.clusters,
            observationAssignments: plan.observationAssignments,
            deprecatedClusterIds: plan.deprecatedClusterIds.map((clusterId) => clusterId as string),
          })
          return {
            observationsScanned: plan.observationsScanned,
            observationsAvailable: plan.observationsAvailable,
            observationsSampled: plan.observationsSampled,
            sampleStrategy: plan.sampleStrategy,
            sampleCap: plan.sampleCap,
            clustersBorn: plan.clustersBorn,
            clustersContinued: plan.clustersContinued,
            clustersDeprecated: plan.clustersDeprecated,
            leavesAssigned: plan.leavesAssigned,
            maxDepthReached: plan.maxDepthReached,
            lineage: plan.lineage,
            planKey,
          } satisfies GardenTaxonomyBuildPlanResult
        }),
      ),
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
    ),
  )

export const saveGardenTaxonomyClustersActivity = (input: GardenTaxonomySaveClustersInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow save clusters",
    input,
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      const clusters = yield* TaxonomyClusterRepository
      // Plan clusters are depth-ascending; preserve that order so children are never saved before parents.
      for (const cluster of plan.clusters) yield* clusters.save(reviveCluster(cluster))
      return { clustersSaved: plan.clusters.length }
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

export const reassignGardenTaxonomyObservationsActivity = (input: GardenTaxonomyReassignObservationsInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow reassign observations",
    input,
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      const observations = yield* TaxonomyObservationRepository
      yield* observations.reassignManyById({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        assignments: plan.observationAssignments.map(reviveAssignment),
      })
      return { observationsReassigned: plan.observationAssignments.length }
    }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId)),
  )

export const deprecateGardenTaxonomyClustersActivity = (input: GardenTaxonomyDeprecateClustersInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow deprecate clusters",
    input,
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      const clusters = yield* TaxonomyClusterRepository
      for (const clusterId of plan.deprecatedClusterIds) {
        yield* clusters.markDeprecated({ clusterId: TaxonomyClusterId(clusterId), timestamp: new Date(input.now) })
      }
      return { clustersDeprecated: plan.deprecatedClusterIds.length }
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
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
      // Only `birth` rows need naming. A `continuation` reuses its
      // predecessor's id (and carries its name unless the topic moved enough to
      // leave the row "Pending"), so the `name === "Pending"` filter below
      // re-names exactly the continuations that drifted.
      const bornClusterIds = new Set(
        input.lineage.flatMap((row) => (row.transitionType === "birth" ? row.toClusterIds : [])),
      )
      const projectId = ProjectId(input.projectId)
      const activeClusters = yield* clusters.listActiveByProject({ projectId, dimension: input.dimension })
      // Name deepest clusters first. Interior naming falls back to its
      // children's already-assigned names; if we name top-down the interior
      // gets handed "Pending" descriptions and either stays Pending or
      // collapses onto the dominant child's name.
      const ordered = [...activeClusters]
        .filter((cluster) => bornClusterIds.has(cluster.id) || !isDisplayableTaxonomyName(cluster.name))
        .sort((a, b) => b.depth - a.depth)
      const byDepth = new Map<number, string[]>()
      for (const cluster of ordered) {
        const bucket = byDepth.get(cluster.depth) ?? []
        bucket.push(cluster.id)
        byDepth.set(cluster.depth, bucket)
      }
      const clusterIdsByDepth = [...byDepth.entries()]
        .sort(([leftDepth], [rightDepth]) => rightDepth - leftDepth)
        .map(([depth, clusterIds]) => ({ depth, clusterIds }))
      return {
        clusterIds: ordered.map((cluster) => cluster.id),
        clusterIdsByDepth,
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
    emitLineageUseCase({ transitions: input.lineage.map(reviveLineage) }).pipe((effect) =>
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
        observationsAvailable: input.observationsAvailable,
        observationsSampled: input.observationsSampled,
        sampleStrategy: input.sampleStrategy,
        sampleCap: input.sampleCap,
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
        observationsAvailable: 0,
        observationsSampled: 0,
        sampleStrategy: TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
        sampleCap: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
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
