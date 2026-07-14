/**
 * Scoped hierarchical taxonomy build for a single custom behavior.
 *
 * A scoped variant of `planHierarchicalTaxonomyUseCase` that clusters a
 * pre-sampled set of observations (resolved from the behavior's `filterSet`
 * over the lookback window) into a sub-tree tagged with `custom_behavior_id`.
 *
 * Differences from the global build:
 *   - The sample is passed in, not read here — the caller's scoped-sampling
 *     step keeps the (large) embeddings in-process rather than round-tripping
 *     them through Temporal.
 *   - Lineage continuity is matched against the behavior's OWN active clusters
 *     (`customBehaviorId` scope), and reused ids keep scoped trends stable
 *     across regenerations. Lineage rows are NOT persisted (scoped trees are
 *     analytic-only in MVP, and the global lineage table stays untouched).
 *   - Member assignments are written to the ClickHouse `custom_behavior_assignments`
 *     slice, NEVER to global `taxonomy_observations.assigned_cluster_id`.
 *   - Prior scoped clusters that no new node continued are RETURNED for a later
 *     deprecate step, not deprecated here — a failed run before that step
 *     leaves the prior scoped tree intact.
 */

import { resolveEmbeddingConfig } from "@domain/ai"
import {
  type CustomBehaviorId,
  generateId,
  type OrganizationId,
  type ProjectId,
  type TaxonomyClusterId,
  type TaxonomyRunId,
} from "@domain/shared"
import { Effect } from "effect"
import { buildHierarchicalClusters } from "../clustering.ts"
import {
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_PENDING_DISPLAY_NAME,
  TAXONOMY_TREE_DEPTH_SCHEDULE,
} from "../constants.ts"
import type { CustomBehaviorAssignment } from "../entities/custom-behavior-assignment.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import { cosineSimilarityNormalized, normalizeTaxonomyEmbedding } from "../helpers.ts"
import { CustomBehaviorAssignmentRepository } from "../ports/custom-behavior-assignment-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import type { TaxonomyScopedClusteringObservation } from "../ports/taxonomy-observation-repository.ts"
import {
  buildPersistedCluster,
  collectNodes,
  type NodeDescriptor,
  type ResolvedTaxonomyLineage,
  resolveTaxonomyLineage,
  seedFromProjectId,
} from "./build-hierarchical-taxonomy.ts"
import { deprecateCustomBehaviorTreeUseCase } from "./deprecate-custom-behavior-tree.ts"

export interface BuildCustomBehaviorTaxonomyInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly customBehaviorId: CustomBehaviorId
  readonly runId: TaxonomyRunId
  readonly observations: readonly TaxonomyScopedClusteringObservation[]
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface BuildCustomBehaviorTaxonomyResult {
  readonly observationsSampled: number
  readonly clustersBorn: number
  readonly clustersContinued: number
  readonly leavesAssigned: number
  readonly maxDepthReached: number
  /** Prior scoped clusters no new node continued; the caller deprecates them after the run succeeds. */
  readonly deprecatedClusterIds: readonly TaxonomyClusterId[]
}

interface PersistedLeafMembers {
  readonly clusterId: TaxonomyClusterId
  readonly observationIndices: readonly number[]
  readonly centroid: readonly number[]
}

interface MaterializedScopedClusters {
  readonly bornLeaves: readonly PersistedLeafMembers[]
  readonly clustersBorn: number
  readonly clustersContinued: number
  readonly maxDepthReached: number
}

const collectScopedDescriptors = (
  input: BuildCustomBehaviorTaxonomyInput,
  normalizedEmbeddings: readonly (readonly number[])[],
): NodeDescriptor[] => {
  const tree = buildHierarchicalClusters({
    embeddings: normalizedEmbeddings,
    depthSchedule: TAXONOMY_TREE_DEPTH_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: seedFromProjectId(`${input.projectId}:${input.customBehaviorId}`),
  })
  const descriptors: NodeDescriptor[] = []
  collectNodes(tree, null, { value: 0 }, descriptors)
  return descriptors
}

const materializeScopedClusters = (params: {
  readonly input: BuildCustomBehaviorTaxonomyInput
  readonly dimension: TaxonomyDimensionType
  readonly now: Date
  readonly embeddingModel: string
  readonly descriptors: readonly NodeDescriptor[]
  readonly normalizedEmbeddings: readonly (readonly number[])[]
  readonly lineage: ResolvedTaxonomyLineage
}) =>
  Effect.gen(function* () {
    const { input, dimension, now, embeddingModel, descriptors, normalizedEmbeddings, lineage } = params
    const { oldById, decisionByTempId, finalIdByTempId } = lineage
    const observations = input.observations

    const orderedDescriptors = [...descriptors].sort((a, b) => a.depth - b.depth)
    const pathByTempId = new Map<string, string>()
    const bornLeaves: PersistedLeafMembers[] = []
    let maxDepthReached = 0
    let clustersBorn = 0
    let clustersContinued = 0
    const clustersRepo = yield* TaxonomyClusterRepository
    // Persist clusters depth-ascending so a child is never saved before its parent.
    for (const node of orderedDescriptors) {
      const finalId = finalIdByTempId.get(node.tempId) ?? generateId()
      const parentFinalId = node.parentTempId === null ? null : (finalIdByTempId.get(node.parentTempId) ?? null)
      const parentPath = node.parentTempId === null ? "" : (pathByTempId.get(node.parentTempId) ?? "")
      const path = parentFinalId === null ? "" : `${parentPath}${parentFinalId}/`
      pathByTempId.set(node.tempId, path)

      const decision = decisionByTempId.get(node.tempId)
      const old = decision?.transition === "continuation" ? oldById.get(decision.reuseId) : undefined
      const carryName = decision?.transition === "continuation" && decision.carryName && old !== undefined

      const memberEmbeddings = node.memberIndices.map((index) => normalizedEmbeddings[index] ?? [])
      const memberStartTimes = node.memberIndices.map((index) => observations[index]?.startTime ?? now)
      const directCount = node.isLeaf ? node.memberIndices.length : 0
      const cluster = buildPersistedCluster({
        id: finalId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        customBehaviorId: input.customBehaviorId,
        dimension,
        parentId: parentFinalId,
        path,
        depth: node.depth,
        splitLinkThreshold: node.splitLinkThreshold,
        memberEmbeddings,
        memberStartTimes,
        memberCount: directCount,
        now,
        name: carryName && old ? old.name : TAXONOMY_PENDING_DISPLAY_NAME,
        description: carryName && old ? old.description : "",
        firstObservedAt: old?.firstObservedAt,
        createdAt: old?.createdAt,
        embeddingModel,
      })
      yield* clustersRepo.save(cluster)
      if (node.depth > maxDepthReached) maxDepthReached = node.depth
      if (old) clustersContinued++
      else clustersBorn++
      if (node.isLeaf) {
        bornLeaves.push({ clusterId: cluster.id, observationIndices: node.memberIndices, centroid: node.centroid })
      }
    }

    return { bornLeaves, clustersBorn, clustersContinued, maxDepthReached } satisfies MaterializedScopedClusters
  })

const buildScopedAssignments = (params: {
  readonly input: BuildCustomBehaviorTaxonomyInput
  readonly now: Date
  readonly bornLeaves: readonly PersistedLeafMembers[]
  readonly normalizedEmbeddings: readonly (readonly number[])[]
}): CustomBehaviorAssignment[] => {
  const { input, now, bornLeaves, normalizedEmbeddings } = params
  const observations = input.observations
  return bornLeaves.flatMap((leaf) =>
    leaf.observationIndices.flatMap((index) => {
      const observation = observations[index]
      const embedding = normalizedEmbeddings[index]
      if (!observation || !embedding) return []
      const confidence = Math.max(0, Math.min(1, cosineSimilarityNormalized(embedding, leaf.centroid)))
      return [
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          customBehaviorId: input.customBehaviorId,
          observationId: observation.observationId,
          sessionId: observation.sessionId,
          assignedClusterId: leaf.clusterId,
          assignmentConfidence: confidence,
          assignmentMethod: "gardening_birth" as const,
          reassignmentRunId: input.runId,
          startTime: observation.startTime,
          retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
          indexedAt: now,
        } satisfies CustomBehaviorAssignment,
      ]
    }),
  )
}

export const buildCustomBehaviorTaxonomyUseCase = (input: BuildCustomBehaviorTaxonomyInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.customBehaviorId", input.customBehaviorId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const embeddingConfig = yield* resolveEmbeddingConfig()
    const clustersRepo = yield* TaxonomyClusterRepository
    const assignmentsRepo = yield* CustomBehaviorAssignmentRepository

    const observations = input.observations
    const normalizedEmbeddings = observations.map((observation) => normalizeTaxonomyEmbedding(observation.embedding))
    const descriptors = collectScopedDescriptors(input, normalizedEmbeddings)

    const previouslyActive = yield* clustersRepo.listActiveByProject({
      projectId: input.projectId,
      dimension,
      customBehaviorId: input.customBehaviorId,
    })
    const lineage = resolveTaxonomyLineage({ descriptors, previouslyActive })

    // The persist phase writes clusters active up front and upserts assignments.
    // If it fails partway (and Temporal exhausts its retries), deprecate the
    // scoped tree we were building so a terminal failure can't leave a half-built
    // tree active and polluting the next run's lineage match. Best-effort so it
    // never masks the original error; scoped to the persist phase so a failure
    // before any write (sampling, tree build) leaves the prior tree intact.
    const { clustersBorn, clustersContinued, maxDepthReached, leavesAssigned } = yield* Effect.gen(function* () {
      const materialized = yield* materializeScopedClusters({
        input,
        dimension,
        now,
        embeddingModel: embeddingConfig.model,
        descriptors,
        normalizedEmbeddings,
        lineage,
      })
      const assignments = buildScopedAssignments({
        input,
        now,
        bornLeaves: materialized.bornLeaves,
        normalizedEmbeddings,
      })
      yield* assignmentsRepo.upsertMany(assignments)
      return { ...materialized, leavesAssigned: assignments.length }
    }).pipe(
      Effect.onError(() =>
        deprecateCustomBehaviorTreeUseCase({
          projectId: input.projectId,
          customBehaviorId: input.customBehaviorId,
          dimension,
          now,
        }).pipe(Effect.ignore),
      ),
    )

    const finalIds = new Set(lineage.finalIdByTempId.values())
    const deprecatedClusterIds = previouslyActive
      .filter((cluster) => !finalIds.has(cluster.id))
      .map((cluster) => cluster.id)

    return {
      observationsSampled: observations.length,
      clustersBorn,
      clustersContinued,
      leavesAssigned,
      maxDepthReached,
      deprecatedClusterIds,
    } satisfies BuildCustomBehaviorTaxonomyResult
  }).pipe(Effect.withSpan("taxonomy.buildCustomBehaviorTaxonomy"))
