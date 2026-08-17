import { hasFeatureFlagUseCase } from "@domain/feature-flags"
import {
  CustomBehaviorId,
  FacetId,
  type FilterSet,
  OrganizationId,
  ProjectId,
  type SessionId,
  TaxonomyClusterId,
  TaxonomyRunId,
} from "@domain/shared"
import {
  assertTaxonomyQualityUseCase,
  CustomBehaviorRepository,
  CustomBehaviorStatus,
  customBehaviorFilterSetHasConditions,
  emitLineageUseCase,
  FacetProjectionRepository,
  type HierarchicalTaxonomyPlan,
  isDisplayableTaxonomyName,
  measureTaxonomyNameQualityUseCase,
  planFacetGardenUseCase,
  planHierarchicalTaxonomyUseCase,
  type ReassignmentLeaf,
  type ReassignTaxonomyObservationByIdInput,
  routeObservationsToLeaves,
  type StagingLeafCluster,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
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
  type TaxonomyNameQualityMetrics,
  type TaxonomyObservationAssignmentMethod,
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
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { billingMeteringRepositoriesLive, withActivityAIMetering } from "./ai-metering.ts"
import { buildHierarchicalClustersInWorker } from "./taxonomy-clustering-worker.ts"
import {
  type AssignmentCoverageMetrics,
  adaptiveGardenRunFields,
  adaptiveSpanAttributes,
  assignmentCoverageFields,
  assignmentCoverageSpanAttributes,
  buildQualityFields,
  buildQualitySpanAttributes,
  nameQualityFields,
  nameQualitySpanAttributes,
} from "./taxonomy-gardening-telemetry.ts"

/**
 * Resolve which builder this garden run persists, from the per-organization
 * `adaptiveTaxonomyClustering` feature flag. Read in the planning activity ONLY
 * (never workflow code — Temporal determinism), via `hasFeatureFlagUseCase` under
 * the garden run's org id (server-side, no request context).
 *
 * Resolved per run, so flipping the flag either way takes effect on the
 * organization's next pass — nothing carries over from the previous one.
 */
const resolveAdaptiveMode = (organizationId: string) =>
  Effect.gen(function* () {
    const flagEnabledForOrg = yield* hasFeatureFlagUseCase({ identifier: "adaptiveTaxonomyClustering" }).pipe(
      withPostgres(FeatureFlagRepositoryLive, getPostgresClient(), OrganizationId(organizationId)),
    )
    return flagEnabledForOrg ? ("enforced" as const) : ("off" as const)
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
  /** Root child count; zero ⇒ the build collapsed to a bare root. */
  readonly topLevelClustersBuilt: number
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
   * Which builder this plan persisted, resolved at plan time. Downstream
   * activities branch on THIS value (never re-reading the flag) so the publish
   * path is a pure function of the staged plan artifact. Absent on plans staged by
   * pre-change code — treated as `off`.
   */
  readonly mode?: TaxonomyAdaptiveClusteringMode
  /**
   * Non-null ⇒ enforced planning fell back to static (structural/non-finite
   * adaptive output), so this plan persists the static tree even though its mode
   * is `enforced`. Clears both `persistsAdaptiveTree` and `leafClusters` so
   * downstream never runs the staging path on a fallen-back plan.
   */
  readonly fallbackReason?: TaxonomyAdaptiveFallbackReason | null
  /** Adaptive-only: leaf id + centroid for full-window routing. Empty/absent on off. */
  readonly leafClusters?: readonly StagingLeafCluster[]
  /**
   * Whether the plan staged a fresh adaptive tree (every id new, prior tree
   * retired wholesale), as opposed to upserting continuations in place. Absent on
   * plans staged by pre-change code, where `leafClusters` stood in for it.
   */
  readonly persistsAdaptiveTree?: boolean
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
 * Whether this plan defers its assignment writes to a full-window routing pass —
 * it staged leaf centroids instead of sample assignments. Keyed on the plan
 * SHAPE, which is exactly what routing needs: without leaves there is nothing to
 * route against.
 *
 * Shape beats mode here because the plan artifact carries no code version: a
 * plan staged by one deploy can be published by the next (Temporal activities
 * run current code), and shape stays correct across that skew where a
 * mode+fallback check would misroute a differently-gated plan.
 */
const planHasStagingLeaves = (plan: StoredGardenTaxonomyPlan): boolean => (plan.leafClusters ?? []).length > 0

/**
 * Whether this plan staged a fresh ADAPTIVE tree — every node a new id, so the
 * swap retires the whole prior tree rather than the ids no node continued.
 * Publication asks this, never the leaf question above: a statically-persisted
 * tree upserts its continuations in place, and retiring the prior tree wholesale
 * would deprecate those very rows while they are serving reads.
 *
 * `off` and an enforced run that fell back to static both answer false. Plans
 * staged by pre-change code carry no flag, and there `leafClusters` was
 * populated on the adaptive path alone, so their shape answers it.
 */
const planPersistsAdaptiveTree = (plan: StoredGardenTaxonomyPlan): boolean =>
  plan.persistsAdaptiveTree ?? planHasStagingLeaves(plan)

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
  /**
   * Parent of each cluster to name, so the workflow hands a naming activity only
   * its own sibling group's samples instead of repeating the whole map — the map
   * spans the sampled window, and repeating it per activity grows the history with
   * project volume.
   */
  readonly parentClusterIdByClusterId: Readonly<Record<string, string | null>>
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

// Scoped full-window reassignment reads its window (the global taxonomy window
// filtered by the behavior's sessions, or the facet's projection cache) and
// writes the scoped taxonomy_view_assignments slice, so it needs all three
// ClickHouse repositories.
const withScopedReassignClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withClickHouse(
      Layer.mergeAll(
        TaxonomyObservationRepositoryLive,
        TaxonomyViewAssignmentRepositoryLive,
        FacetProjectionRepositoryLive,
      ),
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

// Off runs build no adaptive tree and emit nothing.
const emitAdaptivePlanTelemetry = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan): void => {
  if (plan.mode === "off") return
  logger.info("Taxonomy adaptive garden run", {
    metric: "taxonomy.gardenTaxonomyWorkflow.gardenRun",
    ...adaptiveGardenRunFields(input, plan),
  })
}

// The dashboard's only channel into Datadog: logs go to CloudWatch, spans do not.
const annotateAdaptiveTelemetrySpan = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan) =>
  plan.mode === "off"
    ? Effect.void
    : Effect.gen(function* () {
        // Without this, agent-side APM sampling can drop these low-volume traces before the retention filter indexes them.
        yield* Effect.annotateCurrentSpan("manual.keep", true)
        for (const [key, value] of Object.entries(adaptiveSpanAttributes(input, plan))) {
          yield* Effect.annotateCurrentSpan(key, value)
        }
        // Renaming this span orphans the retention filter, the span metrics, and the dashboard, all silently.
      }).pipe(Effect.withSpan("taxonomy.gardenTaxonomyWorkflow.shadow"))

// Emitted for every mode: the adaptive telemetry above returns early on `off`, which is what most projects run.
// Detection only — whether the run then keeps the prior tree is the workflow's call, not this activity's.
const emitDegenerateRebuildTelemetry = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan): void => {
  // The two sets overlap on the adaptive path, where superseded is the whole prior tree.
  const priorClustersAtRisk = new Set([...plan.deprecatedClusterIds, ...plan.supersededClusterIds]).size
  if (plan.topLevelClustersBuilt > 0 || priorClustersAtRisk === 0) return
  logger.info("Taxonomy degenerate rebuild detected", {
    metric: "taxonomy.gardenTaxonomyWorkflow.degenerateRebuild",
    mode: plan.mode,
    organizationId: input.organizationId,
    projectId: input.projectId,
    customBehaviorId: input.customBehaviorId,
    facetId: input.facetId,
    observationsAvailable: plan.observationsAvailable,
    observationsSampled: plan.observationsSampled,
    priorClustersAtRisk,
  })
}

// Emitted for every mode, unlike the adaptive telemetry above; `off` is what most projects run.
const emitBuildQualityTelemetry = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan): void => {
  const metrics = plan.qualityMetrics
  if (!metrics) return
  logger.info("Taxonomy build quality", {
    metric: "taxonomy.gardenTaxonomyWorkflow.buildQuality",
    ...buildQualityFields(input, plan, metrics),
  })
}

const annotateBuildQualitySpan = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan) => {
  const metrics = plan.qualityMetrics
  if (!metrics) return Effect.void
  return Effect.gen(function* () {
    // Same reason as the adaptive span: APM sampling drops these low-volume traces otherwise.
    yield* Effect.annotateCurrentSpan("manual.keep", true)
    for (const [key, value] of Object.entries(buildQualitySpanAttributes(input, plan, metrics))) {
      yield* Effect.annotateCurrentSpan(key, value)
    }
  }).pipe(Effect.withSpan("taxonomy.gardenTaxonomyWorkflow.buildQuality"))
}

// Telemetry + persist the staged plan artifact + shape the activity result. No
// repository requirements (Redis + sync only), so both the topic and facet
// planning paths reuse it after computing the plan under their own layers.
const finalizeGardenPlan = (input: GardenTaxonomyStepInput, plan: HierarchicalTaxonomyPlan) =>
  Effect.gen(function* () {
    yield* Effect.sync(() => emitAdaptivePlanTelemetry(input, plan))
    yield* Effect.sync(() => emitDegenerateRebuildTelemetry(input, plan))
    yield* Effect.sync(() => emitBuildQualityTelemetry(input, plan))
    yield* annotateAdaptiveTelemetrySpan(input, plan)
    yield* annotateBuildQualitySpan(input, plan)
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
      persistsAdaptiveTree: plan.persistsAdaptiveTree,
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
      topLevelClustersBuilt: plan.topLevelClustersBuilt,
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

// What the write needs from a window row once routing is done, in either
// embedding space — so the observation window and the projection window are
// interchangeable to everything downstream of the router.
interface ReassignmentWindowRow {
  readonly observationId: string
  readonly sessionId: SessionId
  readonly startTime: Date
}

// Shared kernel of both full-window reassignment targets: read the bounded live
// window (optionally scoped to the behavior's sessions) and route every row to
// its nearest staging leaf. The caller maps the routed assignments onto its own
// write-target shape — the two targets diverge only there.
const routeWindowToStagingLeaves = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    const window: readonly (ReassignmentWindowRow & { readonly embedding: readonly number[] })[] =
      yield* observations.listWindowForReassignment({
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

/**
 * The facet analogue: route the facet's cached PROJECTIONS, not the observation
 * window. A facet's leaf centroids were built from projection embeddings, so
 * comparing observation embeddings against them would be a cosine between two
 * unrelated spaces. Both sides are normalized at write time
 * (`extract-facet-projections` normalizes before persisting, exactly as the
 * observation path does), which is what `cosineSimilarityNormalized` assumes.
 *
 * This is where the coverage win lands: extraction is cached per session and
 * never invalidated, so the window is the union of every pass, not the 7-day
 * sample. Cost is unchanged — nearest-centroid dot products, no LLM call.
 */
const routeProjectionWindowToStagingLeaves = (
  input: GardenTaxonomyReassignObservationsInput,
  plan: StoredGardenTaxonomyPlan,
  facetId: FacetId,
) =>
  Effect.gen(function* () {
    const projections = yield* FacetProjectionRepository
    const window: readonly (ReassignmentWindowRow & { readonly embedding: readonly number[] })[] =
      yield* projections.listWindowForReassignment({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        facetId,
        limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
        ...(input.filterSet ? { filterSet: input.filterSet } : {}),
      })
    const routed = routeObservationsToLeaves(
      window.map((row) => ({ observationId: row.observationId, embedding: row.embedding })),
      planLeaves(plan),
    )
    return { window, routed }
  })

// Rows the fit floor rejected are written too (as `noise`), so the written count is
// not the assigned count — report them apart or a coverage drop reads as a no-op.
const reassignmentCounts = (rows: readonly { readonly assignmentMethod: TaxonomyObservationAssignmentMethod }[]) => ({
  observationsReassigned: rows.filter((row) => row.assignmentMethod !== "noise").length,
  observationsRejected: rows.filter((row) => row.assignmentMethod === "noise").length,
})

const reassignFullWindowGlobal = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    const { window, routed } = yield* routeWindowToStagingLeaves(input, plan)
    const assignments: ReassignTaxonomyObservationByIdInput[] = routed.map((assignment) => ({
      observationId: assignment.observationId,
      assignedClusterId: assignment.assignedClusterId,
      assignmentMethod: assignment.method,
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
    return { ...reassignmentCounts(assignments), windowSize: window.length }
  }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId))

// The view slice's full-window writer. A cohort routes the observation window; a
// facet routes its projection cache instead — the window source is the only thing
// the two have that differs, and the leaf space follows it.
const reassignFullWindowScoped = (
  input: GardenTaxonomyReassignObservationsInput,
  plan: StoredGardenTaxonomyPlan,
  customBehaviorId: CustomBehaviorId,
) =>
  Effect.gen(function* () {
    const assignmentsRepo = yield* TaxonomyViewAssignmentRepository
    const facetId = plan.facetId == null ? null : FacetId(plan.facetId)
    const { window, routed } = yield* facetId === null
      ? routeWindowToStagingLeaves(input, plan)
      : routeProjectionWindowToStagingLeaves(input, plan, facetId)
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
          customBehaviorId,
          facetId,
          observationId: row.observationId,
          sessionId: row.sessionId,
          assignedClusterId: routed.assignedClusterId,
          assignmentConfidence: routed.confidence,
          assignmentMethod: routed.method,
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
    return { ...reassignmentCounts(assignments), windowSize: window.length }
  }).pipe((effect) => withScopedReassignClickHouse(effect, input.organizationId))

/**
 * Where this plan's assignments go, decided once and read by both the reassign
 * and the catch-up pass.
 *
 * Being a view is asked BEFORE the staging-leaves question, and that ordering is
 * load-bearing: only the whole-project topic tree may touch
 * `taxonomy_observations.assigned_cluster_id`, and a view that fell through to a
 * global branch would overwrite the shared topic tree's assignments with its own
 * cluster ids. A view with no behavior has no slice row to write either (the
 * slice is keyed by behavior), so it takes no full-window path at all rather than
 * the global one.
 */
type ReassignmentTarget =
  | { readonly kind: "fullWindowScoped"; readonly customBehaviorId: CustomBehaviorId }
  | { readonly kind: "fullWindowGlobal" }
  | { readonly kind: "sampleScoped" }
  | { readonly kind: "sampleGlobal" }

const reassignmentTarget = (plan: StoredGardenTaxonomyPlan): ReassignmentTarget => {
  // A plan staged by the pre-unification code has no `customBehaviorId` key
  // (undefined) — a nullish check keeps those, and every global run, on the
  // observation-reassign branch; only a real behavior id routes to the slice.
  const isView = plan.customBehaviorId != null || plan.facetId != null
  if (!planHasStagingLeaves(plan)) return { kind: isView ? "sampleScoped" : "sampleGlobal" }
  if (!isView) return { kind: "fullWindowGlobal" }
  return plan.customBehaviorId == null
    ? { kind: "sampleScoped" }
    : { kind: "fullWindowScoped", customBehaviorId: CustomBehaviorId(plan.customBehaviorId) }
}

// `getCounts` reads `taxonomy_observations`, which is the whole-project topic tree
// only — a view's assignments live in the `taxonomy_view_assignments` slice. So this
// is only meaningful for a global target; emitting it for a view would report the
// project's coverage tagged with that view's id. Views have their own measure
// (`TAXONOMY_LENS_COVERAGE_*`).
const targetIsGlobal = (target: ReassignmentTarget): boolean =>
  target.kind === "fullWindowGlobal" || target.kind === "sampleGlobal"

const readWindowCoverage = (input: GardenTaxonomyReassignObservationsInput) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    return yield* observations.getCounts({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      since: new Date(new Date(input.now).getTime() - TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 24 * 60 * 60_000),
    })
  }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId))

// Measured AFTER this run's writes and before the catch-up pass, which can still
// move the tail indexed during reassignment.
const emitAssignmentCoverageTelemetry = (
  input: GardenTaxonomyReassignObservationsInput,
  plan: StoredGardenTaxonomyPlan,
  reassigned: { readonly observationsReassigned: number; readonly observationsRejected?: number },
) =>
  Effect.gen(function* () {
    const counts = yield* readWindowCoverage(input)
    const metrics: AssignmentCoverageMetrics = {
      mode: plan.mode ?? "off",
      fitFloor: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
      routedFullWindow: planHasStagingLeaves(plan),
      windowTotal: counts.total,
      windowAssigned: counts.assigned,
      windowNoise: counts.noise,
      assignedShare: counts.total === 0 ? 0 : counts.assigned / counts.total,
      observationsReassigned: reassigned.observationsReassigned,
      observationsRejected: reassigned.observationsRejected ?? 0,
    }
    yield* Effect.sync(() =>
      logger.info("Taxonomy assignment coverage", {
        metric: "taxonomy.gardenTaxonomyWorkflow.assignmentCoverage",
        ...assignmentCoverageFields(input, metrics),
      }),
    )
    yield* Effect.gen(function* () {
      // Same reason as the quality spans: APM sampling drops these low-volume traces otherwise.
      yield* Effect.annotateCurrentSpan("manual.keep", true)
      for (const [key, value] of Object.entries(assignmentCoverageSpanAttributes(input, metrics))) {
        yield* Effect.annotateCurrentSpan(key, value)
      }
      // Renaming this span orphans its retention filter and span metrics, silently.
    }).pipe(Effect.withSpan("taxonomy.gardenTaxonomyWorkflow.assignmentCoverage"))
  })

export const reassignGardenTaxonomyObservationsActivity = (input: GardenTaxonomyReassignObservationsInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow reassign observations",
    input,
    // Sample-only reassignment writes what the plan already computed; the
    // full-window paths route their whole window to the staging leaves.
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      const target = reassignmentTarget(plan)
      const reassigned = yield* target.kind === "fullWindowScoped"
        ? reassignFullWindowScoped(input, plan, target.customBehaviorId)
        : target.kind === "fullWindowGlobal"
          ? reassignFullWindowGlobal(input, plan)
          : target.kind === "sampleScoped"
            ? reassignScopedAssignments(input, plan)
            : reassignGlobalObservations(input, plan)
      // Publish here, not one activity later: the write above moved the counts the
      // Behaviours read drives visibility from onto the staged tree, so anything
      // between it and the swap is a window where neither tree is visible. The
      // staged tree is already named by now, so activating it is safe.
      yield* publishStagedTree(input, plan)
      // Best-effort: a coverage read that fails must not fail the publish it measures.
      if (targetIsGlobal(target)) {
        yield* emitAssignmentCoverageTelemetry(input, plan, reassigned).pipe(Effect.ignore)
      }
      return reassigned
    }),
  )

// The ids the publish swap activates. Pre-change adaptive plans carry no
// `stagedClusterIds`, so fall back to their whole cluster set (all staging).
const publishClusterIds = (plan: StoredGardenTaxonomyPlan): TaxonomyClusterId[] =>
  (
    plan.stagedClusterIds ??
    (planPersistsAdaptiveTree(plan) ? plan.clusters.map((cluster) => cluster.id as string) : [])
  ).map((clusterId) => TaxonomyClusterId(clusterId))

// The old tree this publish retires: the whole previous tree on the adaptive
// path, exactly the non-continued clusters when continuations were upserted in
// place (static persist).
const supersededByPublish = (plan: StoredGardenTaxonomyPlan): TaxonomyClusterId[] =>
  (planPersistsAdaptiveTree(plan) ? (plan.supersededClusterIds ?? []) : plan.deprecatedClusterIds).map((clusterId) =>
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
      assignmentMethod: assignment.method,
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
    return reassignmentCounts(assignments).observationsReassigned
  }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId))

// Confirm publication (a no-op when the reassign activity already swapped), then
// run one bounded catch-up pass for rows indexed during reassignment. The target
// is resolved the same way as the reassign pass, so a facet catches up in
// projection space too — skipping it here would leave coverage correct at
// reassign time and stale the moment the swap landed.
const swapAndCatchUp = (input: GardenTaxonomyDeprecateClustersInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const published = yield* publishStagedTree(input, plan)
    const target = reassignmentTarget(plan)

    const caughtUp =
      target.kind === "fullWindowScoped"
        ? (yield* reassignFullWindowScoped(input, plan, target.customBehaviorId)).observationsReassigned
        : target.kind === "fullWindowGlobal"
          ? yield* catchUpGlobal(input, plan)
          : 0

    return { ...published, caughtUp }
  })

export const deprecateGardenTaxonomyClustersActivity = (input: GardenTaxonomyDeprecateClustersInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow deprecate clusters",
    input,
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      return planHasStagingLeaves(plan) ? yield* swapAndCatchUp(input, plan) : yield* publishStagedTree(input, plan)
    }),
  )

// Measured before the gate runs, so a tree that trips it still reports how its names came out.
const emitNameQualityTelemetry = (input: GardenTaxonomyStepInput, metrics: TaxonomyNameQualityMetrics) =>
  Effect.gen(function* () {
    yield* Effect.sync(() =>
      logger.info("Taxonomy name quality", {
        metric: "taxonomy.gardenTaxonomyWorkflow.nameQuality",
        ...nameQualityFields(input, metrics),
      }),
    )
    yield* Effect.annotateCurrentSpan("manual.keep", true)
    for (const [key, value] of Object.entries(nameQualitySpanAttributes(input, metrics))) {
      yield* Effect.annotateCurrentSpan(key, value)
    }
  }).pipe(Effect.withSpan("taxonomy.gardenTaxonomyWorkflow.nameQuality"))

export const assertGardenTaxonomyQualityActivity = (input: GardenTaxonomyStepInput) => {
  const scope = {
    projectId: ProjectId(input.projectId),
    dimension: input.dimension,
    ...(input.customBehaviorId ? { customBehaviorId: CustomBehaviorId(input.customBehaviorId) } : {}),
    ...(input.facetId ? { facetId: FacetId(input.facetId) } : {}),
  }
  return runGardenStep(
    "GardenTaxonomyWorkflow assert quality",
    input,
    Effect.gen(function* () {
      yield* emitNameQualityTelemetry(input, yield* measureTaxonomyNameQualityUseCase(scope))
      return yield* assertTaxonomyQualityUseCase({ organizationId: OrganizationId(input.organizationId), ...scope })
    }).pipe(
      (effect) => withTaxonomyPostgres(effect, input.organizationId),
      (effect) => withTaxonomyClickHouse(effect, input.organizationId),
    ),
  )
}

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
        parentClusterIdByClusterId: Object.fromEntries(
          ordered.map((cluster) => [cluster.id as string, cluster.parentClusterId] as const),
        ),
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
