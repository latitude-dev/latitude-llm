import { hasFeatureFlagUseCase } from "@domain/feature-flags"
import {
  CustomBehaviorId,
  FacetId,
  type FilterSet,
  OrganizationId,
  ProjectId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import {
  assertTaxonomyQualityUseCase,
  boundedPercentiles,
  CustomBehaviorRepository,
  CustomBehaviorStatus,
  customBehaviorFilterSetHasConditions,
  emitLineageUseCase,
  type HierarchicalTaxonomyPlan,
  isDisplayableTaxonomyName,
  parseTaxonomyAdaptiveModeBaseline,
  planFacetGardenUseCase,
  planHierarchicalTaxonomyUseCase,
  type ReassignmentLeaf,
  type ReassignTaxonomyObservationByIdInput,
  resolveTaxonomyAdaptiveMode,
  routeObservationsToLeaves,
  type StagingLeafCluster,
  TAXONOMY_ADAPTIVE_CLUSTERING_MODE_ENV,
  TAXONOMY_ADAPTIVE_POLICY_VERSION,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_REASSIGNMENT_BATCH_SIZE,
  type TaxonomyAdaptiveClusteringMode,
  type TaxonomyAdaptiveFallbackReason,
  type TaxonomyCluster,
  type TaxonomyClusterLineage,
  TaxonomyClusterRepository,
  type TaxonomyDimension,
  TaxonomyObservationRepository,
  type TaxonomyRun,
  TaxonomyRunRepository,
  type TaxonomyViewAssignment,
  TaxonomyViewAssignmentRepository,
} from "@domain/taxonomy"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { RedisBillingSpendReservationLive } from "@platform/cache-redis"
import {
  FacetProjectionRepositoryLive,
  TaxonomyObservationRepositoryLive,
  TaxonomyViewAssignmentRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  CustomBehaviorRepositoryLive,
  FacetRepositoryLive,
  FeatureFlagRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { billingMeteringRepositoriesLive, withActivityAIMetering } from "./ai-metering.ts"
import { buildHierarchicalClustersInWorker } from "./taxonomy-clustering-worker.ts"

/**
 * Resolve the adaptive-clustering rollout mode from the environment baseline and
 * the per-organization `adaptiveTaxonomyClustering` feature flag. Read in the
 * planning activity ONLY (never workflow code — Temporal determinism): the env
 * via `parseEnv`, the flag via `hasFeatureFlagUseCase` under the garden run's
 * org id (server-side, no request context). The env `off` kill switch always
 * wins and short-circuits the flag lookup, so the default path stays a
 * byte-identical no-op with no extra Postgres round-trip.
 */
const resolveAdaptiveMode = (organizationId: string) =>
  Effect.gen(function* () {
    const raw = yield* parseEnv(TAXONOMY_ADAPTIVE_CLUSTERING_MODE_ENV, "string", "off")
    const envBaseline = parseTaxonomyAdaptiveModeBaseline(raw)
    if (envBaseline === "off") return "off" as const
    const flagEnabledForOrg = yield* hasFeatureFlagUseCase({ identifier: "adaptiveTaxonomyClustering" }).pipe(
      withPostgres(FeatureFlagRepositoryLive, getPostgresClient(), OrganizationId(organizationId)),
    )
    return resolveTaxonomyAdaptiveMode({ envBaseline, flagEnabledForOrg })
  })

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
  /**
   * Scope. Absent ⇒ whole-project topic tree (byte-identical to the pre-facets
   * workflow). Present ⇒ a custom behavior — the caller only knows its id; the
   * behavior's facet (`facet_id`) + `filterSet` are loaded in the start activity.
   */
  readonly customBehaviorId?: string
}

export interface GardenTaxonomyStepInput extends GardenTaxonomyActivityInput {
  readonly runId: string
  readonly now: string
  /** Populated by the start step for a custom behavior; the FilterSet the plan samples (absent ⇒ whole-project). */
  readonly filterSet?: FilterSet
  /** Populated by the start step from the behavior's `facet_id`; the facet this run gardens through. */
  readonly facetId?: string
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
  /** Scoped write target; empty on the whole-project topic path. */
  readonly customAssignments: readonly TaxonomyViewAssignment[]
  /** Non-null ⇒ the plan's scope is this cohort. */
  readonly customBehaviorId: string | null
  /** Non-null ⇒ the plan's facet is this facet. A non-null customBehaviorId OR facetId
   * routes the reassign to the view-assignment slice instead of the inline column. */
  readonly facetId?: string | null
  readonly deprecatedClusterIds: readonly string[]
  /**
   * Rollout mode resolved at plan time. Downstream activities branch on THIS
   * value (never re-reading env/flag state) so the publish path is a pure
   * function of the staged plan artifact. Absent on plans staged by pre-change
   * code — treated as `off`.
   */
  readonly mode?: TaxonomyAdaptiveClusteringMode
  /**
   * Non-null ⇒ enforced planning fell back to static (structural/non-finite
   * adaptive output), so this plan persists the static tree even though its mode
   * is `enforced`. Drives `planPersistsAdaptive` so downstream never runs the
   * staging path on a fallen-back plan.
   */
  readonly fallbackReason?: TaxonomyAdaptiveFallbackReason | null
  /** Adaptive-only: leaf id + centroid for full-window routing. Empty/absent on off. */
  readonly leafClusters?: readonly StagingLeafCluster[]
  /** Adaptive-only: the full old active tree the atomic swap deprecates. Empty/absent on off. */
  readonly supersededClusterIds?: readonly string[]
  /**
   * Clusters saved `staging` that the publish swap activates. Absent on plans
   * staged by pre-change code, where the adaptive path activated `clusters`
   * wholesale — `publishClusterIds` falls back to that.
   */
  readonly stagedClusterIds?: readonly string[]
  /** Per-leaf sample member ids, so a staged leaf can be named before its assignments exist. */
  readonly namingMembers?: readonly { readonly clusterId: string; readonly observationIds: readonly string[] }[]
  /** Prior state of the rows this plan upserts in place, for the failure path to restore. Absent on pre-change plans. */
  readonly continuedRestore?: readonly {
    readonly clusterId: string
    readonly parentClusterId: string | null
    readonly path: string
    readonly depth: number
    readonly name: string
    readonly description: string
  }[]
}

/**
 * Whether this plan actually stages an adaptive tree — the single gate every
 * publish step branches on. Keyed on the plan SHAPE (are there staging leaves?),
 * not the mode: a persisted adaptive tree is exactly one that produced staging
 * `leafClusters` for full-window routing. `off`, `shadow`, and an enforced run
 * that fell back to static all leave `leafClusters` empty, so they take the off
 * publish path; only a genuinely-staged adaptive tree has them.
 *
 * Shape beats mode here because the plan artifact carries no code version: a
 * plan staged by one deploy can be published by the next (Temporal activities
 * run current code), and shape stays correct across that skew where a
 * mode+fallback check would misroute a differently-gated plan.
 */
const planPersistsAdaptive = (plan: StoredGardenTaxonomyPlan): boolean => (plan.leafClusters ?? []).length > 0

const chunk = <A>(items: readonly A[], size: number): A[][] => {
  const out: A[][] = []
  for (let offset = 0; offset < items.length; offset += size) out.push(items.slice(offset, offset + size))
  return out
}

class TaxonomyStagingInvariantError extends Data.TaggedError("TaxonomyStagingInvariantError")<{
  readonly message: string
}> {}

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
  /**
   * Sample member ids per cluster to name, for the pre-publish pass where a
   * staged cluster has no ClickHouse assignments yet. Empty on the post-publish
   * path, which reads members by `assigned_cluster_id`.
   */
  readonly memberObservationIdsByClusterId: Readonly<Record<string, readonly string[]>>
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
    input.workflowId ??
    (input.customBehaviorId
      ? `org:${input.organizationId}:taxonomy:gardenCustomBehavior:${input.customBehaviorId}`
      : `org:${input.organizationId}:taxonomy:garden:${input.projectId}:${input.dimension}`)
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
  new Date(now.getTime() - TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 24 * 60 * 60_000)

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

const reviveCustomAssignment = (assignment: TaxonomyViewAssignment): TaxonomyViewAssignment => ({
  ...assignment,
  startTime: reviveDate(assignment.startTime),
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

const withCustomBehaviorPostgres = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withPostgres(
      Layer.mergeAll(TaxonomyClusterRepositoryLive, CustomBehaviorRepositoryLive),
      getPostgresClient(),
      OrganizationId(organizationId),
    ),
  )

const withTaxonomyClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(withClickHouse(TaxonomyObservationRepositoryLive, getClickhouseClient(), OrganizationId(organizationId)))

const withCustomBehaviorClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withClickHouse(TaxonomyViewAssignmentRepositoryLive, getClickhouseClient(), OrganizationId(organizationId)),
  )

// Scoped full-window reassignment reads the global taxonomy window (filtered by
// the behavior's sessions) and writes the scoped taxonomy_view_assignments
// slice, so it needs both ClickHouse repositories.
const withScopedReassignClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withClickHouse(
      Layer.mergeAll(TaxonomyObservationRepositoryLive, TaxonomyViewAssignmentRepositoryLive),
      getClickhouseClient(),
      OrganizationId(organizationId),
    ),
  )

const withFacetPostgres = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withPostgres(
      Layer.mergeAll(TaxonomyClusterRepositoryLive, FacetRepositoryLive, billingMeteringRepositoriesLive),
      getPostgresClient(),
      OrganizationId(organizationId),
    ),
    Effect.provide(RedisBillingSpendReservationLive(getRedisClient())),
  )

// Facet planning samples sessions + reads the projection cache (ClickHouse), and
// extraction embeds/generates via AI; the plan use-case also needs the taxonomy
// observation repo in context even though the facet path clusters projections.
const withFacetClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withClickHouse(
      Layer.mergeAll(TaxonomyObservationRepositoryLive, FacetProjectionRepositoryLive),
      getClickhouseClient(),
      OrganizationId(organizationId),
    ),
  )

const withFacetAi = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(withAi(Layer.mergeAll(AIEmbedLive, AIGenerateLive), getRedisClient()))

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
            customBehaviorId: input.customBehaviorId,
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
            customBehaviorId: input.customBehaviorId,
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

const startGlobalRun = (step: GardenTaxonomyStepInput) => {
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

// Scoped start: mark the behavior Generating and stamp the cadence anchor at run
// start (so the scoped sweep throttles on it and it survives a crash mid-run),
// carrying the behavior's FilterSet AND its facet (`facet_id`) into the step so
// the plan samples the right sessions and clusters through the right facet. A
// facet-scoped behavior with no filter is whole-project through that facet, so an
// empty filter is threaded as absent.
const startCustomBehaviorRun = (step: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow start run",
    step,
    Effect.gen(function* () {
      const behaviors = yield* CustomBehaviorRepository
      const behavior = yield* behaviors.findById(CustomBehaviorId(step.customBehaviorId as string))
      const startedAt = new Date(step.now)
      yield* behaviors.save({ ...behavior, status: CustomBehaviorStatus.Generating, updatedAt: startedAt })
      yield* behaviors.markGardened({ id: behavior.id, gardenedAt: startedAt })
      const hasFilter = customBehaviorFilterSetHasConditions(behavior.filterSet)
      return {
        ...step,
        ...(hasFilter ? { filterSet: behavior.filterSet } : {}),
        ...(behavior.facetId ? { facetId: behavior.facetId } : {}),
        observationsScanned: 0,
        observationsAvailable: 0,
        observationsSampled: 0,
        sampleStrategy: TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
        sampleCap: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
      } satisfies GardenTaxonomyStartResult
    }).pipe((effect) => withCustomBehaviorPostgres(effect, step.organizationId)),
  )

export const startGardenTaxonomyRunActivity = (input: GardenTaxonomyActivityInput) => {
  const step = baseStepInput(input)
  return step.customBehaviorId ? startCustomBehaviorRun(step) : startGlobalRun(step)
}

/**
 * One bounded, embedding-free event per adaptive garden run (`gardenRun`), plus
 * — in shadow mode — a paired `shadowComparison` event carrying static-vs-adaptive
 * shape counts, deltas, and partition ARI. This goes to stdout → CloudWatch (the
 * workflows service does not forward logs to Datadog), so it is the un-sampled,
 * always-there record and a debugging breadcrumb alongside the rest of the
 * service's logs. The Datadog dashboard reads the APM span mirror
 * (`annotateAdaptiveTelemetrySpan`), which is sampled, not these logs. Off runs
 * compute no adaptive tree and emit nothing. Distributions are bounded
 * percentiles, never raw arrays.
 */
const emitAdaptivePlanTelemetry = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan): void => {
  const mode = plan.mode
  if (mode === "off") return
  const diagnostics = plan.decisionMetadata
  const relativeSeparation = boundedPercentiles(diagnostics?.acceptedRelativeSeparations ?? [])
  const routingThreshold = boundedPercentiles(diagnostics?.routingThresholds ?? [])
  const shared = {
    policyVersion: TAXONOMY_ADAPTIVE_POLICY_VERSION,
    mode,
    organizationId: input.organizationId,
    projectId: input.projectId,
    customBehaviorId: input.customBehaviorId,
    observationsSampled: plan.observationsSampled,
    fallbackReason: plan.fallbackReason,
    adaptiveDurationMs: plan.adaptiveDurationMs,
    adaptiveBuildError: plan.adaptiveBuildError,
    staticDurationMs: plan.staticDurationMs,
    // Best-effort resident memory at plan time; worker threads share this process,
    // so the build's footprint is reflected here (see the clustering worker).
    peakRssBytes: process.memoryUsage().rss,
    rejectionReason: diagnostics?.rejectionReasonCounts,
    relativeSeparation,
  }
  logger.info("Taxonomy adaptive garden run", {
    metric: "taxonomy.gardenTaxonomyWorkflow.gardenRun",
    ...shared,
    nodeCount: diagnostics?.nodeCount ?? 0,
    leafCount: diagnostics?.leafCount ?? 0,
    maxDepth: diagnostics?.maxDepth ?? 0,
    selectedKByDepth: diagnostics?.selectedKByDepth,
    acceptedSplits: diagnostics?.acceptedSplits ?? 0,
    rejectedCandidates: diagnostics?.rejectedCandidates ?? 0,
    routingThreshold,
    clustersBorn: plan.clustersBorn,
    clustersContinued: plan.clustersContinued,
    clustersDeprecated: plan.clustersDeprecated,
  })
  if (mode === "shadow" && plan.comparison) {
    logger.info("Taxonomy shadow comparison", {
      metric: "taxonomy.gardenTaxonomyWorkflow.shadowComparison",
      ...shared,
      static: plan.comparison.static,
      adaptive: plan.comparison.adaptive,
      diff: plan.comparison.diff,
    })
  }
}

// Flattened, embedding-free attributes for the APM span. Datadog span tags are
// flat scalars, so nested comparison objects are dotted out. This is the channel
// the shadow dashboard actually reads: the app ships logs only to CloudWatch,
// but the workflows service already exports these spans to Datadog APM.
const adaptiveSpanAttributes = (
  input: GardenTaxonomyStepInput,
  plan: HierarchicalTaxonomyPlan,
): Record<string, string | number> => {
  const diagnostics = plan.decisionMetadata
  const relativeSeparation = boundedPercentiles(diagnostics?.acceptedRelativeSeparations ?? [])
  const routingThreshold = boundedPercentiles(diagnostics?.routingThresholds ?? [])
  const attributes: Record<string, string | number> = {
    "taxonomy.adaptive.policyVersion": TAXONOMY_ADAPTIVE_POLICY_VERSION,
    "taxonomy.adaptive.mode": plan.mode,
    "taxonomy.organizationId": input.organizationId,
    "taxonomy.projectId": input.projectId,
    "taxonomy.customBehaviorId": input.customBehaviorId ?? "none",
    "taxonomy.adaptive.observationsSampled": plan.observationsSampled,
    "taxonomy.adaptive.fallbackReason": plan.fallbackReason ?? "none",
    // Carries the time a FAILED build burned as well as a successful one, so a
    // deadline breach is visible as a duration at the deadline rather than a 0.
    "taxonomy.adaptive.durationMs": plan.adaptiveDurationMs,
    "taxonomy.adaptive.buildError": plan.adaptiveBuildError ?? "none",
    "taxonomy.adaptive.staticDurationMs": plan.staticDurationMs,
    "taxonomy.adaptive.peakRssBytes": process.memoryUsage().rss,
    "taxonomy.adaptive.clustersBorn": plan.clustersBorn,
    "taxonomy.adaptive.clustersContinued": plan.clustersContinued,
    "taxonomy.adaptive.clustersDeprecated": plan.clustersDeprecated,
    "taxonomy.adaptive.relSep.p10": relativeSeparation.p10,
    "taxonomy.adaptive.relSep.p50": relativeSeparation.p50,
    "taxonomy.adaptive.relSep.p90": relativeSeparation.p90,
    "taxonomy.adaptive.routing.p10": routingThreshold.p10,
    "taxonomy.adaptive.routing.p50": routingThreshold.p50,
    "taxonomy.adaptive.routing.p90": routingThreshold.p90,
  }
  if (diagnostics) {
    attributes["taxonomy.adaptive.nodeCount"] = diagnostics.nodeCount
    attributes["taxonomy.adaptive.leafCount"] = diagnostics.leafCount
    attributes["taxonomy.adaptive.maxDepth"] = diagnostics.maxDepth
    attributes["taxonomy.adaptive.acceptedSplits"] = diagnostics.acceptedSplits
    attributes["taxonomy.adaptive.rejectedCandidates"] = diagnostics.rejectedCandidates
    attributes["taxonomy.adaptive.rejection.undersizedChild"] = diagnostics.rejectionReasonCounts.undersizedChild
    attributes["taxonomy.adaptive.rejection.dominantChild"] = diagnostics.rejectionReasonCounts.dominantChild
    attributes["taxonomy.adaptive.rejection.lowScore"] = diagnostics.rejectionReasonCounts.lowScore
    attributes["taxonomy.adaptive.rejection.lowRelativeSeparation"] =
      diagnostics.rejectionReasonCounts.lowRelativeSeparation
    // The quantity the root gate actually decides on, and whether it forced a
    // re-search. The relSep percentiles above cover accepted splits tree-wide, so
    // they say nothing about a run whose root collapsed.
    attributes["taxonomy.adaptive.bestRootSeparation"] = diagnostics.bestRootSeparation
    attributes["taxonomy.adaptive.escalated"] = diagnostics.escalated ? 1 : 0
  }
  const comparison = plan.comparison
  if (comparison) {
    attributes["taxonomy.shadow.static.rootChildCount"] = comparison.static.rootChildCount
    attributes["taxonomy.shadow.static.nodeCount"] = comparison.static.nodeCount
    attributes["taxonomy.shadow.static.leafCount"] = comparison.static.leafCount
    attributes["taxonomy.shadow.static.maxDepth"] = comparison.static.maxDepth
    attributes["taxonomy.shadow.adaptive.rootChildCount"] = comparison.adaptive.rootChildCount
    attributes["taxonomy.shadow.adaptive.nodeCount"] = comparison.adaptive.nodeCount
    attributes["taxonomy.shadow.adaptive.leafCount"] = comparison.adaptive.leafCount
    attributes["taxonomy.shadow.adaptive.maxDepth"] = comparison.adaptive.maxDepth
    attributes["taxonomy.shadow.diff.rootChildDelta"] = comparison.diff.rootChildDelta
    attributes["taxonomy.shadow.diff.nodeCountDelta"] = comparison.diff.nodeCountDelta
    attributes["taxonomy.shadow.diff.leafCountDelta"] = comparison.diff.leafCountDelta
    attributes["taxonomy.shadow.diff.maxDepthDelta"] = comparison.diff.maxDepthDelta
    attributes["taxonomy.shadow.diff.partitionAri"] = comparison.diff.partitionAri
  }
  return attributes
}

// Mirror the comparison onto a dedicated APM span so the shadow dashboard has a
// channel that reaches Datadog (logs go only to CloudWatch here). Off runs emit
// nothing. `annotateCurrentSpan`/`withSpan` are no-ops without a live tracer, so
// this is inert in tests and under the pre-change (off) default.
const annotateAdaptiveTelemetrySpan = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan) =>
  plan.mode === "off"
    ? Effect.void
    : Effect.gen(function* () {
        // Force the Datadog trace agent to keep this trace chunk at ingestion.
        // Garden runs are low-volume (one span per project per ~6h), so agent-side
        // APM sampling could otherwise drop them before the backend retention
        // filter can index them. `manual.keep` is the ingestion half; the 100%
        // retention filter on this operation is the indexing half.
        yield* Effect.annotateCurrentSpan("manual.keep", true)
        for (const [key, value] of Object.entries(adaptiveSpanAttributes(input, plan))) {
          yield* Effect.annotateCurrentSpan(key, value)
        }
      }).pipe(Effect.withSpan("taxonomy.gardenTaxonomyWorkflow.shadow"))

// Telemetry + persist the staged plan artifact + shape the activity result. No
// repository requirements (Redis + sync only), so both the topic and facet
// planning paths reuse it after computing the plan under their own layers.
const finalizeGardenPlan = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan) =>
  Effect.gen(function* () {
    yield* Effect.sync(() => emitAdaptivePlanTelemetry(input, plan))
    yield* annotateAdaptiveTelemetrySpan(input, plan)
    const planKey = yield* storeGardenTaxonomyPlan(input, {
      clusters: plan.clusters,
      observationAssignments: plan.observationAssignments,
      customAssignments: plan.customAssignments,
      customBehaviorId: plan.customBehaviorId,
      facetId: plan.facetId,
      deprecatedClusterIds: plan.deprecatedClusterIds.map((clusterId) => clusterId as string),
      mode: plan.mode,
      fallbackReason: plan.fallbackReason,
      leafClusters: plan.leafClusters,
      supersededClusterIds: plan.supersededClusterIds.map((clusterId) => clusterId as string),
      stagedClusterIds: plan.stagedClusterIds.map((clusterId) => clusterId as string),
      namingMembers: plan.namingMembers.map((members) => ({
        clusterId: members.clusterId as string,
        observationIds: members.observationIds,
      })),
      continuedRestore: plan.continuedRestore.map((row) => ({
        ...row,
        clusterId: row.clusterId as string,
        parentClusterId: row.parentClusterId === null ? null : (row.parentClusterId as string),
      })),
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
  })

/**
 * Facet planning: sample → extract projections → cluster the non-unclear ones,
 * all in `planFacetGardenUseCase` (tested with fakes). This activity only wires
 * the live layers and offloads the k-means build to the worker thread (like the
 * topic path) so a large facet sample never blocks the Temporal activity worker.
 *
 * Extraction is the taxonomy's heaviest AI spend — one generation per sampled
 * session, up to the proposal sample cap — so the activity carries a metering
 * scope. Its per-call idempotency keys come from a counter, while extraction runs
 * `FACET_EXTRACTION_CONCURRENCY` calls at a time, so a retry can reuse a key for a
 * different call than the first attempt did. That direction is safe: a reused key
 * dedupes to "already charged", so a retry undercharges the unflushed tail rather
 * than double-charging it, and everything already flushed to the projection cache
 * is skipped instead of re-extracted.
 */
const planFacetGarden = (input: GardenTaxonomyStepInput) =>
  planFacetGardenUseCase({
    organizationId: OrganizationId(input.organizationId),
    projectId: ProjectId(input.projectId),
    runId: TaxonomyRunId(input.runId),
    dimension: input.dimension,
    now: new Date(input.now),
    facetId: FacetId(input.facetId as string),
    ...(input.customBehaviorId ? { customBehaviorId: CustomBehaviorId(input.customBehaviorId) } : {}),
    ...(input.filterSet ? { filterSet: input.filterSet } : {}),
    clusterBuilder: (builderInput) =>
      Effect.tryPromise({
        try: () => buildHierarchicalClustersInWorker(builderInput),
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
  }).pipe(
    withActivityAIMetering({
      organizationId: input.organizationId,
      projectId: input.projectId,
      label: "taxonomy-facet-extract",
    }),
    (effect) => withFacetPostgres(effect, input.organizationId),
    (effect) => withFacetClickHouse(effect, input.organizationId),
    withFacetAi,
  )

const planTopicGarden = (input: GardenTaxonomyStepInput) =>
  Effect.gen(function* () {
    const mode = yield* resolveAdaptiveMode(input.organizationId)
    return yield* planHierarchicalTaxonomyUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      runId: TaxonomyRunId(input.runId),
      dimension: input.dimension,
      now: new Date(input.now),
      mode,
      clusterBuilder: (builderInput) =>
        Effect.tryPromise({
          try: () => buildHierarchicalClustersInWorker(builderInput),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }),
      ...(input.customBehaviorId ? { customBehaviorId: CustomBehaviorId(input.customBehaviorId) } : {}),
      ...(input.filterSet ? { filterSet: input.filterSet } : {}),
    })
  }).pipe(
    (effect) => withTaxonomyPostgres(effect, input.organizationId),
    (effect) => withTaxonomyClickHouse(effect, input.organizationId),
  )

export const planHierarchicalGardenTaxonomyActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow plan hierarchical tree",
    input,
    (input.facetId ? planFacetGarden(input) : planTopicGarden(input)).pipe(
      Effect.flatMap((plan) => finalizeGardenPlan(input, plan)),
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

// --- Off (sample-only) reassignment: byte-identical to the pre-change path. ---

const reassignGlobalObservations = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    yield* observations.reassignManyById({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      assignments: plan.observationAssignments.map(reviveAssignment),
    })
    return { observationsReassigned: plan.observationAssignments.length }
  }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId))

const reassignScopedAssignments = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const assignments = yield* TaxonomyViewAssignmentRepository
    yield* assignments.upsertMany(plan.customAssignments.map(reviveCustomAssignment))
    return { observationsReassigned: plan.customAssignments.length }
  }).pipe((effect) => withCustomBehaviorClickHouse(effect, input.organizationId))

// --- Adaptive (full-window) reassignment into the staging leaves. ---

const planLeaves = (plan: StoredGardenTaxonomyPlan): ReassignmentLeaf[] =>
  (plan.leafClusters ?? []).map((leaf) => ({ clusterId: leaf.clusterId, centroid: leaf.centroid }))

// Fraction of the window still pointing at a soon-to-deprecate cluster after the
// bulk write that we tolerate as concurrent inserts (the catch-up pass mops
// those up after the swap). More than this means the bulk write did not land.
const STAGING_SNAPSHOT_STRAGGLER_FRACTION = 0.05

// Shared kernel of both full-window reassignment targets: read the bounded live
// window (optionally scoped to the behavior's sessions) and route every row to
// its nearest staging leaf. The caller maps the routed assignments onto its own
// write-target shape — the two targets diverge only there.
const routeWindowToStagingLeaves = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    const window = yield* observations.listWindowForReassignment({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
      ...(input.filterSet ? { filterSet: input.filterSet } : {}),
    })
    const routed = routeObservationsToLeaves(
      window.map((row) => ({ observationId: row.observationId, embedding: row.embedding })),
      planLeaves(plan),
    )
    return { window, routed }
  })

const reassignFullWindowGlobal = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    const { window, routed } = yield* routeWindowToStagingLeaves(input, plan)
    const assignments: ReassignTaxonomyObservationByIdInput[] = routed.map((assignment) => ({
      observationId: assignment.observationId,
      assignedClusterId: assignment.assignedClusterId,
      assignmentMethod: "gardening_reassign" as const,
      assignmentConfidence: assignment.confidence,
      reassignmentRunId: TaxonomyRunId(input.runId),
      indexedAt: new Date(input.now),
    }))
    for (const batch of chunk(assignments, TAXONOMY_REASSIGNMENT_BATCH_SIZE)) {
      yield* observations.reassignManyById({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        assignments: batch,
      })
    }
    // Confirm the bounded snapshot no longer points at the old tree before we let
    // the swap deprecate it. Counted server-side so no embeddings ship back.
    const supersededClusterIds = (plan.supersededClusterIds ?? []).map((clusterId) => TaxonomyClusterId(clusterId))
    if (supersededClusterIds.length > 0) {
      const { total, matching } = yield* observations.countWindowAssignedToClusters({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
        clusterIds: supersededClusterIds,
      })
      if (matching > Math.floor(total * STAGING_SNAPSHOT_STRAGGLER_FRACTION)) {
        return yield* new TaxonomyStagingInvariantError({
          message: `Full-window reassignment left ${matching}/${total} observations on the old tree`,
        })
      }
    }
    return { observationsReassigned: assignments.length, windowSize: window.length }
  }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId))

const reassignFullWindowScoped = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const assignmentsRepo = yield* TaxonomyViewAssignmentRepository
    const { window, routed } = yield* routeWindowToStagingLeaves(input, plan)
    // Correlate routed results back to window rows for the slice's sessionId/startTime.
    const routedById = new Map(routed.map((assignment) => [assignment.observationId, assignment] as const))
    const now = new Date(input.now)
    const assignments: TaxonomyViewAssignment[] = window.flatMap((row) => {
      const routed = routedById.get(row.observationId)
      if (!routed) return []
      return [
        {
          organizationId: OrganizationId(input.organizationId),
          projectId: ProjectId(input.projectId),
          customBehaviorId: CustomBehaviorId(plan.customBehaviorId as string),
          facetId: null,
          observationId: row.observationId,
          sessionId: row.sessionId,
          assignedClusterId: routed.assignedClusterId,
          assignmentConfidence: routed.confidence,
          assignmentMethod: "gardening_reassign" as const,
          reassignmentRunId: TaxonomyRunId(input.runId),
          startTime: row.startTime,
          retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
          indexedAt: now,
        } satisfies TaxonomyViewAssignment,
      ]
    })
    for (const batch of chunk(assignments, TAXONOMY_REASSIGNMENT_BATCH_SIZE)) {
      yield* assignmentsRepo.upsertMany(batch)
    }
    return { observationsReassigned: assignments.length, windowSize: window.length }
  }).pipe((effect) => withScopedReassignClickHouse(effect, input.organizationId))

export const reassignGardenTaxonomyObservationsActivity = (input: GardenTaxonomyReassignObservationsInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow reassign observations",
    input,
    // A plan staged by the pre-unification code has no `customBehaviorId` key
    // (undefined) — a truthy check keeps those, and every global run, on the
    // observation-reassign branch; only a real behavior id routes to the slice.
    // Off does sample-only reassignment (byte-identical); adaptive routes the
    // full bounded live window to the staging leaves.
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      // Any view (a cohort OR a facet) writes the view-assignment slice; only
      // the whole-project topic tree reassigns the inline column. Facet plans are
      // always off-mode (no staging leaves), so they take the sample-only branch.
      const isView = plan.customBehaviorId != null || plan.facetId != null
      const reassigned = yield* planPersistsAdaptive(plan)
        ? plan.customBehaviorId
          ? reassignFullWindowScoped(input, plan)
          : reassignFullWindowGlobal(input, plan)
        : isView
          ? reassignScopedAssignments(input, plan)
          : reassignGlobalObservations(input, plan)
      // Publish here, not one activity later: the write above moved the counts the
      // Behaviours read drives visibility from onto the staged tree, so anything
      // between it and the swap is a window where neither tree is visible. The
      // staged tree is already named by now, so activating it is safe.
      yield* publishStagedTree(input, plan)
      return reassigned
    }),
  )

// The ids the publish swap activates. Pre-change adaptive plans carry no
// `stagedClusterIds`, so fall back to their whole cluster set (all staging).
const publishClusterIds = (plan: StoredGardenTaxonomyPlan): TaxonomyClusterId[] =>
  (
    plan.stagedClusterIds ?? (planPersistsAdaptive(plan) ? plan.clusters.map((cluster) => cluster.id as string) : [])
  ).map((clusterId) => TaxonomyClusterId(clusterId))

// The old tree this publish retires: the whole previous tree on the adaptive
// path, exactly the non-continued clusters when continuations were upserted in
// place (static persist).
const supersededByPublish = (plan: StoredGardenTaxonomyPlan): TaxonomyClusterId[] =>
  (planPersistsAdaptive(plan) ? (plan.supersededClusterIds ?? []) : plan.deprecatedClusterIds).map((clusterId) =>
    TaxonomyClusterId(clusterId),
  )

// Put the rows a failed publish overwrote back the way the read resolves them:
// parent, path, depth and naming. Centroid and counters are deliberately left
// alone — online routing keeps updating those while a garden runs, so writing the
// pre-run values back would discard live work to fix a visibility problem.
const restoreContinuedRows = (rows: NonNullable<StoredGardenTaxonomyPlan["continuedRestore"]>, timestamp: Date) =>
  Effect.gen(function* () {
    if (rows.length === 0) return 0
    const clusters = yield* TaxonomyClusterRepository
    const live = yield* clusters.listByIds(rows.map((row) => TaxonomyClusterId(row.clusterId)))
    const liveById = new Map(live.map((cluster) => [cluster.id as string, cluster] as const))
    let restored = 0
    for (const row of rows) {
      const current = liveById.get(row.clusterId)
      if (current === undefined) continue
      yield* clusters.save({
        ...current,
        parentClusterId: row.parentClusterId === null ? null : TaxonomyClusterId(row.parentClusterId),
        path: row.path,
        depth: row.depth,
        name: row.name,
        description: row.description,
        updatedAt: timestamp,
      })
      restored += 1
    }
    return restored
  })

/**
 * The single publication point: in ONE Postgres transaction retire the old tree
 * and activate the staged one. Idempotent (activation is guarded to
 * `state = 'staging'`), so running it again from the next activity is a no-op —
 * which is what keeps the publish atomic while the workflow keeps its activity
 * shape.
 */
const publishStagedTree = (input: GardenTaxonomyPlanReferenceInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const supersededClusterIds = supersededByPublish(plan)
    const stagingClusterIds = publishClusterIds(plan)
    yield* Effect.gen(function* () {
      const clusters = yield* TaxonomyClusterRepository
      yield* clusters.swapActiveTree({ supersededClusterIds, stagingClusterIds, timestamp: new Date(input.now) })
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId))
    return { clustersDeprecated: supersededClusterIds.length, clustersActivated: stagingClusterIds.length }
  })

const catchUpGlobal = (input: GardenTaxonomyDeprecateClustersInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    const leaves = planLeaves(plan)
    // Narrow the read to rows NOT already on a current leaf — the tail indexed
    // between the pre-swap snapshot and now — so we only pull embeddings for the
    // stragglers, not the whole 10k window.
    const stragglers = yield* observations.listWindowForReassignment({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
      excludeAssignedClusterIds: leaves.map((leaf) => leaf.clusterId),
    })
    const routed = routeObservationsToLeaves(
      stragglers.map((row) => ({ observationId: row.observationId, embedding: row.embedding })),
      leaves,
    )
    const assignments: ReassignTaxonomyObservationByIdInput[] = routed.map((assignment) => ({
      observationId: assignment.observationId,
      assignedClusterId: assignment.assignedClusterId,
      assignmentMethod: "gardening_reassign" as const,
      assignmentConfidence: assignment.confidence,
      reassignmentRunId: TaxonomyRunId(input.runId),
      indexedAt: new Date(input.now),
    }))
    for (const batch of chunk(assignments, TAXONOMY_REASSIGNMENT_BATCH_SIZE)) {
      yield* observations.reassignManyById({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        assignments: batch,
      })
    }
    return assignments.length
  }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId))

// Adaptive: confirm publication (a no-op when the reassign activity already
// swapped), then run one bounded catch-up pass for observations indexed during
// reassignment.
const swapAndCatchUp = (input: GardenTaxonomyDeprecateClustersInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const published = yield* publishStagedTree(input, plan)

    const caughtUp = plan.customBehaviorId
      ? (yield* reassignFullWindowScoped(input, plan)).observationsReassigned
      : yield* catchUpGlobal(input, plan)

    return { ...published, caughtUp }
  })

export const deprecateGardenTaxonomyClustersActivity = (input: GardenTaxonomyDeprecateClustersInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow deprecate clusters",
    input,
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      return planPersistsAdaptive(plan) ? yield* swapAndCatchUp(input, plan) : yield* publishStagedTree(input, plan)
    }),
  )

export const assertGardenTaxonomyQualityActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow assert quality",
    input,
    assertTaxonomyQualityUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      dimension: input.dimension,
      ...(input.customBehaviorId ? { customBehaviorId: CustomBehaviorId(input.customBehaviorId) } : {}),
      ...(input.facetId ? { facetId: FacetId(input.facetId) } : {}),
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
    ),
  )

export const planGardenTaxonomyNamingActivity = (
  input: GardenTaxonomyStepInput & GardenTaxonomyLineageResult & { readonly planKey?: string },
) =>
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
      // With a plan key the tree is named BEFORE the swap, so read this run's own
      // clusters by id (they are still `staging`). Without one this is the
      // post-publish path and reads the active tree, unchanged.
      const plan =
        input.planKey === undefined ? null : yield* loadGardenTaxonomyPlan({ ...input, planKey: input.planKey })
      const candidates =
        plan === null
          ? yield* clusters.listActiveByProject({
              projectId,
              dimension: input.dimension,
              ...(input.customBehaviorId ? { customBehaviorId: CustomBehaviorId(input.customBehaviorId) } : {}),
              ...(input.facetId ? { facetId: FacetId(input.facetId) } : {}),
            })
          : yield* clusters.listByIds(plan.clusters.map((cluster) => cluster.id))
      // Name deepest clusters first. Interior naming falls back to its
      // children's already-assigned names; if we name top-down the interior
      // gets handed "Pending" descriptions and either stays Pending or
      // collapses onto the dominant child's name.
      const ordered = [...candidates]
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
      const named = new Set(ordered.map((cluster) => cluster.id as string))
      const memberObservationIdsByClusterId = Object.fromEntries(
        (plan?.namingMembers ?? [])
          .filter((members) => named.has(members.clusterId))
          .map((members) => [members.clusterId, members.observationIds] as const),
      )
      return {
        clusterIds: ordered.map((cluster) => cluster.id),
        clusterIdsByDepth,
        clustersScanned: candidates.length,
        memberObservationIdsByClusterId,
      } satisfies GardenTaxonomyNamingPlanResult
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

// Global emits lineage rows to the shared lineage table; a scoped run is
// analytic-only and never writes into the global lineage table.
export const emitGardenTaxonomyLineageActivity = (input: GardenTaxonomyStepInput & GardenTaxonomyLineageResult) =>
  runGardenStep(
    "GardenTaxonomyWorkflow emit lineage",
    input,
    input.customBehaviorId
      ? Effect.succeed({ lineageEmitted: 0 })
      : emitLineageUseCase({ transitions: input.lineage.map(reviveLineage) }).pipe(
          Effect.as({ lineageEmitted: input.lineage.length }),
          (effect) => withTaxonomyPostgres(effect, input.organizationId),
        ),
  )

const buildRun = (input: GardenTaxonomyCompleteInput, status: "completed"): TaxonomyRun => ({
  id: TaxonomyRunId(input.runId),
  organizationId: OrganizationId(input.organizationId),
  projectId: ProjectId(input.projectId),
  dimension: input.dimension,
  trigger: input.trigger,
  status,
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
})

const completeGlobalRun = (input: GardenTaxonomyCompleteInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow complete run",
    input,
    Effect.gen(function* () {
      const runs = yield* TaxonomyRunRepository
      const run = buildRun(input, "completed")
      yield* runs.save(run)
      return run
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

const completeCustomBehaviorRun = (input: GardenTaxonomyCompleteInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow complete run",
    input,
    Effect.gen(function* () {
      const behaviors = yield* CustomBehaviorRepository
      const behavior = yield* behaviors.findById(CustomBehaviorId(input.customBehaviorId as string))
      yield* behaviors.save({ ...behavior, status: CustomBehaviorStatus.Ready, updatedAt: new Date() })
      return buildRun(input, "completed")
    }).pipe((effect) => withCustomBehaviorPostgres(effect, input.organizationId)),
  )

export const completeGardenTaxonomyRunActivity = (input: GardenTaxonomyCompleteInput) =>
  input.customBehaviorId ? completeCustomBehaviorRun(input) : completeGlobalRun(input)

const failRun = (input: GardenTaxonomyFailInput): TaxonomyRun => ({
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
})

const failGlobalRun = (input: GardenTaxonomyFailInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow fail run",
    input,
    Effect.gen(function* () {
      const runs = yield* TaxonomyRunRepository
      const run = failRun(input)
      yield* runs.save(run)
      return run
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

const failCustomBehaviorRun = (input: GardenTaxonomyFailInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow fail run",
    input,
    Effect.gen(function* () {
      const behaviors = yield* CustomBehaviorRepository
      // A missing behavior (deleted mid-run) has no status to set; treat as a no-op failure.
      const behavior = yield* behaviors
        .findById(CustomBehaviorId(input.customBehaviorId as string))
        .pipe(Effect.orElseSucceed(() => null))
      if (behavior !== null) {
        yield* behaviors.save({ ...behavior, status: CustomBehaviorStatus.Failed, updatedAt: new Date() })
      }
      return failRun(input)
    }).pipe((effect) => withCustomBehaviorPostgres(effect, input.organizationId)),
  )

// Takes the raw workflow input (+ error), not a prior step result, so it can mark
// a run/behavior failed even when the START activity itself failed (leaving a
// scoped behavior stuck `generating`). `baseStepInput` re-derives the same
// deterministic run id start would have used.
export const failGardenTaxonomyRunActivity = (input: GardenTaxonomyActivityInput & { readonly error: string }) => {
  const failInput: GardenTaxonomyFailInput = { ...baseStepInput(input), error: input.error }
  return failInput.customBehaviorId ? failCustomBehaviorRun(failInput) : failGlobalRun(failInput)
}

// Best-effort cleanup of abandoned staging rows when a publish fails before the
// swap: leaves the old tree active and removes the orphaned staging tree. Safe
// and idempotent — `deleteStaging` is guarded to `state = 'staging'`, so a swap
// that already activated the tree makes this a no-op, and a missing plan
// (start failed before staging) cleans nothing.
export const cleanupGardenTaxonomyStagingActivity = (input: GardenTaxonomyActivityInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow cleanup staging",
    input,
    Effect.gen(function* () {
      const step = baseStepInput(input)
      const reference: GardenTaxonomyPlanReferenceInput = { ...step, planKey: gardenTaxonomyPlanKey(step) }
      const plan = yield* loadGardenTaxonomyPlan(reference).pipe(Effect.orElseSucceed(() => null))
      if (plan === null) return { stagingDeleted: 0, continuationsRestored: 0 }
      // Keyed on what the plan actually staged, NOT on the adaptive shape: every
      // mode stages fresh clusters on the whole-project tree, so gating this on
      // adaptive leaked a staging tree per failed run.
      const stagedClusterIds = publishClusterIds(plan)
      const restore = plan.continuedRestore ?? []
      if (stagedClusterIds.length === 0 && restore.length === 0) {
        return { stagingDeleted: 0, continuationsRestored: 0 }
      }
      const clusters = yield* TaxonomyClusterRepository
      if (stagedClusterIds.length > 0) yield* clusters.deleteStaging({ clusterIds: stagedClusterIds })
      // A static continuation was upserted in place, so deleting staging alone would
      // leave the live tree rewritten — and any continuation re-parented under a
      // staged node pointing at a row that no longer exists.
      const continuationsRestored = yield* restoreContinuedRows(restore, new Date(step.now))
      return { stagingDeleted: stagedClusterIds.length, continuationsRestored }
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

export { errorMessage as gardenTaxonomyErrorMessage }
