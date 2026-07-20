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
  type CustomBehaviorAssignment,
  CustomBehaviorAssignmentRepository,
  CustomBehaviorRepository,
  CustomBehaviorStatus,
  emitLineageUseCase,
  isAdaptiveModeActive,
  isDisplayableTaxonomyName,
  parseTaxonomyAdaptiveModeBaseline,
  planHierarchicalTaxonomyUseCase,
  type ReassignmentLeaf,
  type ReassignTaxonomyObservationByIdInput,
  resolveTaxonomyAdaptiveMode,
  routeObservationsToLeaves,
  type StagingLeafCluster,
  TAXONOMY_ADAPTIVE_CLUSTERING_MODE_ENV,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_REASSIGNMENT_BATCH_SIZE,
  type TaxonomyAdaptiveClusteringMode,
  type TaxonomyCluster,
  type TaxonomyClusterLineage,
  TaxonomyClusterRepository,
  type TaxonomyDimension,
  TaxonomyObservationRepository,
  type TaxonomyRun,
  TaxonomyRunRepository,
} from "@domain/taxonomy"
import {
  CustomBehaviorAssignmentRepositoryLive,
  TaxonomyObservationRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  CustomBehaviorRepositoryLive,
  TaxonomyClusterRepositoryLive,
  TaxonomyLineageRepositoryLive,
  TaxonomyRunRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Data, Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { buildHierarchicalClustersInWorker } from "./taxonomy-clustering-worker.ts"

/**
 * Resolve the adaptive-clustering rollout mode. Read in the planning activity
 * ONLY (never workflow code — Temporal determinism), from the environment
 * baseline; the per-organization enforcement flag lands in Phase 4 (LAT-773) and
 * is passed as `false` until then. `off` (the default and any unrecognized
 * value) keeps the byte-identical pre-change path.
 */
const resolveAdaptiveMode = Effect.gen(function* () {
  const raw = yield* parseEnv(TAXONOMY_ADAPTIVE_CLUSTERING_MODE_ENV, "string", "off")
  return resolveTaxonomyAdaptiveMode({
    envBaseline: parseTaxonomyAdaptiveModeBaseline(raw),
    flagEnabledForOrg: false,
  })
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
   * Scope. Absent ⇒ global gardening (project-wide, byte-identical to the
   * pre-unification workflow). Present ⇒ a custom behavior's scoped sub-tree.
   */
  readonly customBehaviorId?: string
}

export interface GardenTaxonomyStepInput extends GardenTaxonomyActivityInput {
  readonly runId: string
  readonly now: string
  /** Populated by the start step for the scoped path; the FilterSet the plan samples. */
  readonly filterSet?: FilterSet
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
  /** Scoped write target; empty on the global path. */
  readonly customAssignments: readonly CustomBehaviorAssignment[]
  /** Non-null ⇒ the plan is scoped to this custom behavior (drives the reassign write target). */
  readonly customBehaviorId: string | null
  readonly deprecatedClusterIds: readonly string[]
  /**
   * Rollout mode resolved at plan time. Downstream activities branch on THIS
   * value (never re-reading env/flag state) so the publish path is a pure
   * function of the staged plan artifact. Absent on plans staged by pre-change
   * code — treated as `off`.
   */
  readonly mode?: TaxonomyAdaptiveClusteringMode
  /** Adaptive-only: leaf id + centroid for full-window routing. Empty/absent on off. */
  readonly leafClusters?: readonly StagingLeafCluster[]
  /** Adaptive-only: the full old active tree the atomic swap deprecates. Empty/absent on off. */
  readonly supersededClusterIds?: readonly string[]
}

const planMode = (plan: StoredGardenTaxonomyPlan): TaxonomyAdaptiveClusteringMode => plan.mode ?? "off"

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

const reviveCustomAssignment = (assignment: CustomBehaviorAssignment): CustomBehaviorAssignment => ({
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
    withClickHouse(CustomBehaviorAssignmentRepositoryLive, getClickhouseClient(), OrganizationId(organizationId)),
  )

// Scoped full-window reassignment reads the global taxonomy window (filtered by
// the behavior's sessions) and writes the scoped custom_behavior_assignments
// slice, so it needs both ClickHouse repositories.
const withScopedReassignClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withClickHouse(
      Layer.mergeAll(TaxonomyObservationRepositoryLive, CustomBehaviorAssignmentRepositoryLive),
      getClickhouseClient(),
      OrganizationId(organizationId),
    ),
  )

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
// carrying the behavior's FilterSet into the step so the plan can sample it.
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
      return {
        ...step,
        filterSet: behavior.filterSet,
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

export const planHierarchicalGardenTaxonomyActivity = (input: GardenTaxonomyStepInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow plan hierarchical tree",
    input,
    Effect.gen(function* () {
      const mode = yield* resolveAdaptiveMode
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
      Effect.flatMap((plan) =>
        Effect.gen(function* () {
          const planKey = yield* storeGardenTaxonomyPlan(input, {
            clusters: plan.clusters,
            observationAssignments: plan.observationAssignments,
            customAssignments: plan.customAssignments,
            customBehaviorId: plan.customBehaviorId,
            deprecatedClusterIds: plan.deprecatedClusterIds.map((clusterId) => clusterId as string),
            mode: plan.mode,
            leafClusters: plan.leafClusters,
            supersededClusterIds: plan.supersededClusterIds.map((clusterId) => clusterId as string),
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
    const assignments = yield* CustomBehaviorAssignmentRepository
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
    // the swap deprecate it.
    const superseded = new Set(plan.supersededClusterIds ?? [])
    const confirmation = yield* observations.listWindowForReassignment({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
    })
    const stragglers = confirmation.filter(
      (row) => row.assignedClusterId !== null && superseded.has(row.assignedClusterId),
    ).length
    if (stragglers > Math.floor(confirmation.length * STAGING_SNAPSHOT_STRAGGLER_FRACTION)) {
      return yield* new TaxonomyStagingInvariantError({
        message: `Full-window reassignment left ${stragglers}/${confirmation.length} observations on the old tree`,
      })
    }
    return { observationsReassigned: assignments.length, windowSize: window.length }
  }).pipe((effect) => withTaxonomyClickHouse(effect, input.organizationId))

const reassignFullWindowScoped = (input: GardenTaxonomyReassignObservationsInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const assignmentsRepo = yield* CustomBehaviorAssignmentRepository
    const { window, routed } = yield* routeWindowToStagingLeaves(input, plan)
    // Correlate routed results back to window rows for the slice's sessionId/startTime.
    const routedById = new Map(routed.map((assignment) => [assignment.observationId, assignment] as const))
    const now = new Date(input.now)
    const assignments: CustomBehaviorAssignment[] = window.flatMap((row) => {
      const routed = routedById.get(row.observationId)
      if (!routed) return []
      return [
        {
          organizationId: OrganizationId(input.organizationId),
          projectId: ProjectId(input.projectId),
          customBehaviorId: CustomBehaviorId(plan.customBehaviorId as string),
          observationId: row.observationId,
          sessionId: row.sessionId,
          assignedClusterId: routed.assignedClusterId,
          assignmentConfidence: routed.confidence,
          assignmentMethod: "gardening_reassign" as const,
          reassignmentRunId: TaxonomyRunId(input.runId),
          startTime: row.startTime,
          retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
          indexedAt: now,
        } satisfies CustomBehaviorAssignment,
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
      if (isAdaptiveModeActive(planMode(plan))) {
        return yield* plan.customBehaviorId
          ? reassignFullWindowScoped(input, plan)
          : reassignFullWindowGlobal(input, plan)
      }
      return yield* plan.customBehaviorId
        ? reassignScopedAssignments(input, plan)
        : reassignGlobalObservations(input, plan)
    }),
  )

// Off: deprecate exactly the non-continued old clusters (byte-identical to the
// pre-change path — continuations kept their ids via in-place upsert).
const deprecateOffClusters = (input: GardenTaxonomyDeprecateClustersInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const clusters = yield* TaxonomyClusterRepository
    for (const clusterId of plan.deprecatedClusterIds) {
      yield* clusters.markDeprecated({ clusterId: TaxonomyClusterId(clusterId), timestamp: new Date(input.now) })
    }
    return { clustersDeprecated: plan.deprecatedClusterIds.length }
  }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId))

const catchUpGlobal = (input: GardenTaxonomyDeprecateClustersInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    const leaves = planLeaves(plan)
    const leafIds = new Set(leaves.map((leaf) => leaf.clusterId as string))
    const window = yield* observations.listWindowForReassignment({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
    })
    // Only observations not already pointing at a current leaf — the tail indexed
    // between the pre-swap snapshot and now.
    const stragglers = window.filter((row) => row.assignedClusterId === null || !leafIds.has(row.assignedClusterId))
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

// Adaptive: atomically swap the staged tree in for the old one, then run one
// bounded catch-up pass for observations indexed during reassignment.
const swapAndCatchUp = (input: GardenTaxonomyDeprecateClustersInput, plan: StoredGardenTaxonomyPlan) =>
  Effect.gen(function* () {
    const supersededClusterIds = (plan.supersededClusterIds ?? []).map((clusterId) => TaxonomyClusterId(clusterId))
    const stagingClusterIds = plan.clusters.map((cluster) => cluster.id)
    yield* Effect.gen(function* () {
      const clusters = yield* TaxonomyClusterRepository
      yield* clusters.swapActiveTree({
        supersededClusterIds,
        stagingClusterIds,
        timestamp: new Date(input.now),
      })
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId))

    const caughtUp = plan.customBehaviorId
      ? (yield* reassignFullWindowScoped(input, plan)).observationsReassigned
      : yield* catchUpGlobal(input, plan)

    return {
      clustersDeprecated: supersededClusterIds.length,
      clustersActivated: stagingClusterIds.length,
      caughtUp,
    }
  })

export const deprecateGardenTaxonomyClustersActivity = (input: GardenTaxonomyDeprecateClustersInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow deprecate clusters",
    input,
    Effect.gen(function* () {
      const plan = yield* loadGardenTaxonomyPlan(input)
      return isAdaptiveModeActive(planMode(plan))
        ? yield* swapAndCatchUp(input, plan)
        : yield* deprecateOffClusters(input, plan)
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
      const activeClusters = yield* clusters.listActiveByProject({
        projectId,
        dimension: input.dimension,
        ...(input.customBehaviorId ? { customBehaviorId: CustomBehaviorId(input.customBehaviorId) } : {}),
      })
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
// (start failed before staging) cleans nothing. Off runs are a no-op.
export const cleanupGardenTaxonomyStagingActivity = (input: GardenTaxonomyActivityInput) =>
  runGardenStep(
    "GardenTaxonomyWorkflow cleanup staging",
    input,
    Effect.gen(function* () {
      const step = baseStepInput(input)
      const reference: GardenTaxonomyPlanReferenceInput = { ...step, planKey: gardenTaxonomyPlanKey(step) }
      const plan = yield* loadGardenTaxonomyPlan(reference).pipe(Effect.orElseSucceed(() => null))
      if (plan === null || !isAdaptiveModeActive(planMode(plan))) return { stagingDeleted: 0 }
      const clusters = yield* TaxonomyClusterRepository
      yield* clusters.deleteStaging({ clusterIds: plan.clusters.map((cluster) => cluster.id) })
      return { stagingDeleted: plan.clusters.length }
    }).pipe((effect) => withTaxonomyPostgres(effect, input.organizationId)),
  )

export { errorMessage as gardenTaxonomyErrorMessage }
