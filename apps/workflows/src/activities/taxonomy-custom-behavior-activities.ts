import {
  CustomBehaviorId,
  type FilterSet,
  OrganizationId,
  ProjectId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import {
  assertTaxonomyQualityUseCase,
  buildCustomBehaviorTaxonomyUseCase,
  CUSTOM_BEHAVIOR_LOOKBACK_DAYS,
  CustomBehaviorRepository,
  CustomBehaviorStatus,
  deprecateCustomBehaviorTreeUseCase,
  isDisplayableTaxonomyName,
  nameCustomBehaviorClusterUseCase,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TaxonomyClusterRepository,
  type TaxonomyDimension,
  TaxonomyObservationRepository,
} from "@domain/taxonomy"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { RedisCacheStoreLive, RedisDistributedLockRepositoryLive } from "@platform/cache-redis"
import {
  CustomBehaviorAssignmentRepositoryLive,
  TaxonomyObservationRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { CustomBehaviorRepositoryLive, TaxonomyClusterRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("taxonomy-custom-behavior-workflow")

const DAY_MS = 24 * 60 * 60 * 1000

export interface GardenCustomBehaviorActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly customBehaviorId: string
  readonly trigger: "manual" | "cron"
  /** Temporal execution run id; salts the deterministic taxonomy run id per execution. */
  readonly workflowRunId?: string
}

export interface GardenCustomBehaviorStepInput extends GardenCustomBehaviorActivityInput {
  readonly runId: string
  readonly now: string
  readonly filterSet: FilterSet
  /**
   * Lookback window in days, sourced from `CUSTOM_BEHAVIOR_LOOKBACK_DAYS` in the
   * start activity and passed as a parameter — never hardcoded inside the query
   * — so a future selectable window is a param-source swap (LAT-746 Q2).
   */
  readonly lookbackDays: number
}

export type GardenCustomBehaviorBuildResult =
  | { readonly outcome: "insufficient_observations"; readonly observationsSampled: number }
  | {
      readonly outcome: "built"
      readonly observationsSampled: number
      readonly clustersBorn: number
      readonly clustersContinued: number
      readonly leavesAssigned: number
      readonly maxDepthReached: number
      readonly deprecatedClusterIds: readonly string[]
    }

export interface GardenCustomBehaviorNamingPlanResult {
  readonly clusterIdsByDepth: ReadonlyArray<{ readonly depth: number; readonly clusterIds: readonly string[] }>
  readonly clustersScanned: number
}

export interface GardenCustomBehaviorResult {
  readonly customBehaviorId: string
  readonly status: "ready" | "failed"
  readonly observationsSampled: number
  readonly clustersBorn: number
  readonly clustersContinued: number
  readonly clustersDeprecated: number
}

const deterministicRunId = (customBehaviorId: string, workflowRunId: string | undefined): TaxonomyRunId => {
  const source = workflowRunId === undefined ? customBehaviorId : `${customBehaviorId}\0${workflowRunId}`
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

const errorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string") {
    return error._tag
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const withCustomBehaviorPostgres = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withPostgres(
      Layer.mergeAll(TaxonomyClusterRepositoryLive, CustomBehaviorRepositoryLive),
      getPostgresClient(),
      OrganizationId(organizationId),
    ),
  )

const withCustomBehaviorClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withClickHouse(
      Layer.mergeAll(TaxonomyObservationRepositoryLive, CustomBehaviorAssignmentRepositoryLive),
      getClickhouseClient(),
      OrganizationId(organizationId),
    ),
  )

const withCustomBehaviorAiAndRedis = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const redisClient = getRedisClient()
  return effect.pipe(
    withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), redisClient),
    Effect.provide(Layer.mergeAll(RedisCacheStoreLive(redisClient), RedisDistributedLockRepositoryLive(redisClient))),
  )
}

// The start step returns the behavior's `filterSet`, which holds user-entered
// filter values; keep it out of structured logs (it's carried in the activity
// result for downstream steps regardless).
const redactForLog = (result: unknown): unknown => {
  if (result !== null && typeof result === "object" && "filterSet" in result) {
    const { filterSet: _filterSet, ...rest } = result as Record<string, unknown>
    return rest
  }
  return result
}

const runStep = <A, E>(name: string, input: GardenCustomBehaviorActivityInput, effect: Effect.Effect<A, E, never>) => {
  const startedAt = Date.now()
  return Effect.runPromise(
    effect.pipe(
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info(`${name} completed`, {
            metric: "taxonomy.gardenCustomBehaviorWorkflow.activity",
            organizationId: input.organizationId,
            projectId: input.projectId,
            customBehaviorId: input.customBehaviorId,
            durationMs: Date.now() - startedAt,
            result: redactForLog(result),
          }),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error(`${name} failed`, {
            metric: "taxonomy.gardenCustomBehaviorWorkflow.activity",
            organizationId: input.organizationId,
            projectId: input.projectId,
            customBehaviorId: input.customBehaviorId,
            durationMs: Date.now() - startedAt,
            error,
          }),
        ),
      ),
      withTracing,
    ),
  )
}

const dimension: TaxonomyDimension = "topic"

export const startGardenCustomBehaviorRunActivity = (
  input: GardenCustomBehaviorActivityInput,
): Promise<GardenCustomBehaviorStepInput> =>
  runStep(
    "GardenCustomBehaviorWorkflow start run",
    input,
    Effect.gen(function* () {
      const behaviors = yield* CustomBehaviorRepository
      const behavior = yield* behaviors.findById(CustomBehaviorId(input.customBehaviorId))
      yield* behaviors.save({ ...behavior, status: CustomBehaviorStatus.Generating, updatedAt: new Date() })
      return {
        ...input,
        runId: deterministicRunId(input.customBehaviorId, input.workflowRunId),
        now: new Date().toISOString(),
        filterSet: behavior.filterSet,
        lookbackDays: CUSTOM_BEHAVIOR_LOOKBACK_DAYS,
      } satisfies GardenCustomBehaviorStepInput
    }).pipe((effect) => withCustomBehaviorPostgres(effect, input.organizationId)),
  )

export const buildGardenCustomBehaviorTaxonomyActivity = (
  step: GardenCustomBehaviorStepInput,
): Promise<GardenCustomBehaviorBuildResult> =>
  runStep(
    "GardenCustomBehaviorWorkflow build scoped tree",
    step,
    Effect.gen(function* () {
      const observations = yield* TaxonomyObservationRepository
      const now = new Date(step.now)
      const since = new Date(now.getTime() - step.lookbackDays * DAY_MS)
      const sample = yield* observations.listForCustomBehaviorSample({
        organizationId: OrganizationId(step.organizationId),
        projectId: ProjectId(step.projectId),
        since,
        limit: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
        filterSet: step.filterSet,
      })
      // Cold-start gate: same >=15 floor as global gardening. Below it we skip
      // clustering entirely so a prior scoped tree stays untouched.
      if (sample.length < TAXONOMY_GARDENING_MIN_OBSERVATIONS) {
        return {
          outcome: "insufficient_observations",
          observationsSampled: sample.length,
        } satisfies GardenCustomBehaviorBuildResult
      }
      const result = yield* buildCustomBehaviorTaxonomyUseCase({
        organizationId: OrganizationId(step.organizationId),
        projectId: ProjectId(step.projectId),
        customBehaviorId: CustomBehaviorId(step.customBehaviorId),
        runId: TaxonomyRunId(step.runId),
        observations: sample,
        dimension,
        now,
      })
      return {
        outcome: "built",
        observationsSampled: result.observationsSampled,
        clustersBorn: result.clustersBorn,
        clustersContinued: result.clustersContinued,
        leavesAssigned: result.leavesAssigned,
        maxDepthReached: result.maxDepthReached,
        deprecatedClusterIds: result.deprecatedClusterIds.map((id) => id as string),
      } satisfies GardenCustomBehaviorBuildResult
    }).pipe(
      (effect) => withCustomBehaviorPostgres(effect, step.organizationId),
      (effect) => withCustomBehaviorClickHouse(effect, step.organizationId),
    ),
  )

export const planGardenCustomBehaviorNamingActivity = (
  step: GardenCustomBehaviorStepInput,
): Promise<GardenCustomBehaviorNamingPlanResult> =>
  runStep(
    "GardenCustomBehaviorWorkflow plan naming",
    step,
    Effect.gen(function* () {
      const clusters = yield* TaxonomyClusterRepository
      const active = yield* clusters.listActiveByProject({
        projectId: ProjectId(step.projectId),
        dimension,
        customBehaviorId: CustomBehaviorId(step.customBehaviorId),
      })
      // Name deepest first, same as global gardening: interiors fall back to
      // their children's already-assigned names.
      const ordered = [...active]
        .filter((cluster) => !isDisplayableTaxonomyName(cluster.name))
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
      return { clusterIdsByDepth, clustersScanned: active.length } satisfies GardenCustomBehaviorNamingPlanResult
    }).pipe((effect) => withCustomBehaviorPostgres(effect, step.organizationId)),
  )

export const nameGardenCustomBehaviorClusterActivity = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly customBehaviorId: string
  readonly clusterId: string
}): Promise<void> =>
  runStep(
    "GardenCustomBehaviorWorkflow name cluster",
    { ...input, trigger: "manual" },
    nameCustomBehaviorClusterUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      customBehaviorId: CustomBehaviorId(input.customBehaviorId),
      clusterId: TaxonomyClusterId(input.clusterId),
    }).pipe(
      Effect.asVoid,
      (effect) => withCustomBehaviorPostgres(effect, input.organizationId),
      (effect) => withCustomBehaviorClickHouse(effect, input.organizationId),
      withCustomBehaviorAiAndRedis,
    ),
  )

export const assertGardenCustomBehaviorQualityActivity = (step: GardenCustomBehaviorStepInput): Promise<void> =>
  runStep(
    "GardenCustomBehaviorWorkflow assert quality",
    step,
    assertTaxonomyQualityUseCase({
      organizationId: OrganizationId(step.organizationId),
      projectId: ProjectId(step.projectId),
      dimension,
      customBehaviorId: CustomBehaviorId(step.customBehaviorId),
    }).pipe(Effect.asVoid, (effect) => withCustomBehaviorPostgres(effect, step.organizationId)),
  )

export const deprecateGardenCustomBehaviorClustersActivity = (
  input: GardenCustomBehaviorStepInput & { readonly clusterIds: readonly string[] },
): Promise<{ readonly clustersDeprecated: number }> =>
  runStep(
    "GardenCustomBehaviorWorkflow deprecate prior clusters",
    input,
    Effect.gen(function* () {
      const clusters = yield* TaxonomyClusterRepository
      const timestamp = new Date(input.now)
      for (const clusterId of input.clusterIds) {
        yield* clusters.markDeprecated({ clusterId: TaxonomyClusterId(clusterId), timestamp })
      }
      return { clustersDeprecated: input.clusterIds.length }
    }).pipe((effect) => withCustomBehaviorPostgres(effect, input.organizationId)),
  )

/**
 * Failure-path cleanup: deprecate the whole active scoped tree for the behavior
 * so a mid-run failure (naming/quality/partial build) doesn't leave half-named
 * clusters active and polluting the next regeneration's lineage match. Distinct
 * from the happy-path deprecate step (which targets only prior non-continued
 * clusters) and never runs on the insufficient-observations path, which must
 * leave any prior tree untouched.
 */
export const cleanupGardenCustomBehaviorClustersActivity = (
  input: GardenCustomBehaviorActivityInput,
): Promise<{ readonly clustersDeprecated: number }> =>
  runStep(
    "GardenCustomBehaviorWorkflow cleanup scoped clusters",
    input,
    deprecateCustomBehaviorTreeUseCase({
      projectId: ProjectId(input.projectId),
      customBehaviorId: CustomBehaviorId(input.customBehaviorId),
      dimension,
    }).pipe((effect) => withCustomBehaviorPostgres(effect, input.organizationId)),
  )

export const completeGardenCustomBehaviorRunActivity = (
  input: GardenCustomBehaviorStepInput & {
    readonly clustersBorn: number
    readonly clustersContinued: number
    readonly observationsSampled: number
    readonly clustersDeprecated: number
  },
): Promise<GardenCustomBehaviorResult> =>
  runStep(
    "GardenCustomBehaviorWorkflow complete run",
    input,
    Effect.gen(function* () {
      const behaviors = yield* CustomBehaviorRepository
      const behavior = yield* behaviors.findById(CustomBehaviorId(input.customBehaviorId))
      yield* behaviors.save({ ...behavior, status: CustomBehaviorStatus.Ready, updatedAt: new Date() })
      return {
        customBehaviorId: input.customBehaviorId,
        status: "ready",
        observationsSampled: input.observationsSampled,
        clustersBorn: input.clustersBorn,
        clustersContinued: input.clustersContinued,
        clustersDeprecated: input.clustersDeprecated,
      } satisfies GardenCustomBehaviorResult
    }).pipe((effect) => withCustomBehaviorPostgres(effect, input.organizationId)),
  )

export const failGardenCustomBehaviorRunActivity = (
  input: GardenCustomBehaviorActivityInput & { readonly error: string; readonly observationsSampled?: number },
): Promise<GardenCustomBehaviorResult> =>
  runStep(
    "GardenCustomBehaviorWorkflow fail run",
    input,
    Effect.gen(function* () {
      const behaviors = yield* CustomBehaviorRepository
      // A missing behavior (deleted mid-run) has no status to set; treat as a no-op failure.
      const behavior = yield* behaviors
        .findById(CustomBehaviorId(input.customBehaviorId))
        .pipe(Effect.orElseSucceed(() => null))
      if (behavior !== null) {
        yield* behaviors.save({ ...behavior, status: CustomBehaviorStatus.Failed, updatedAt: new Date() })
      }
      return {
        customBehaviorId: input.customBehaviorId,
        status: "failed",
        observationsSampled: input.observationsSampled ?? 0,
        clustersBorn: 0,
        clustersContinued: 0,
        clustersDeprecated: 0,
      } satisfies GardenCustomBehaviorResult
    }).pipe((effect) => withCustomBehaviorPostgres(effect, input.organizationId)),
  )

export { errorMessage as gardenCustomBehaviorErrorMessage }
