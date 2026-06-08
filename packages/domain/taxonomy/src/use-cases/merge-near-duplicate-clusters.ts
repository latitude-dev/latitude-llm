import { AI } from "@domain/ai"
import { generateId, type OrganizationId, type ProjectId, TaxonomyLineageId, type TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_JUDGE_MODEL,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_MERGE_CANDIDATES_PER_PARENT,
  TAXONOMY_MERGE_COMPONENT_MIN_SIMILARITY,
  TAXONOMY_MERGE_JUDGE_CONCURRENCY,
  TAXONOMY_MERGE_JUDGE_THRESHOLD,
  TAXONOMY_MERGE_NAME_NOMINATION_JACCARD,
  TAXONOMY_MERGE_NAME_NOMINATION_MIN_SIMILARITY,
  TAXONOMY_MERGE_NEAREST_NEIGHBORS,
  TAXONOMY_MERGE_THRESHOLD,
  TAXONOMY_NAMING_TIMEOUT_MS,
  TAXONOMY_TREE_MIN_CHILDREN,
  TAXONOMY_TREE_ROOT_LINK_THRESHOLD,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import {
  cosineSimilarityNormalized,
  isDisplayableTaxonomyName,
  mergeTaxonomyCentroids,
  normalizeTaxonomyCentroid,
} from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { loadClusteringCalibration } from "./load-calibration.ts"

export interface MergeNearDuplicateClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface MergeNearDuplicateClustersResult {
  readonly clustersMerged: number
  readonly observationsReassigned: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

interface MergeCandidatePair {
  readonly left: TaxonomyCluster
  readonly right: TaxonomyCluster
  readonly similarity: number
}

const NAME_STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "for", "to", "with", "in", "on"])

const nameTokens = (name: string): ReadonlySet<string> =>
  new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !NAME_STOPWORDS.has(token)),
  )

const namesOverlap = (a: string, b: string): boolean => {
  const left = nameTokens(a)
  const right = nameTokens(b)
  if (left.size === 0 || right.size === 0) return false
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection++
  const jaccard = intersection / (left.size + right.size - intersection)
  // Subset containment catches qualifier-style duplicates ("Account
  // Verification" vs "Account Verification with Name and ZIP Code") whose
  // Jaccard dilutes below the threshold.
  const contained = intersection === Math.min(left.size, right.size)
  return jaccard >= TAXONOMY_MERGE_NAME_NOMINATION_JACCARD || contained
}

const candidateMergePairs = (
  clusters: readonly TaxonomyCluster[],
  similarityFloor: number,
): readonly MergeCandidatePair[] => {
  const vectors = clusters.map((cluster) => normalizeTaxonomyCentroid(cluster.centroid))
  const pairsByKey = new Map<string, MergeCandidatePair>()
  for (let i = 0; i < clusters.length; i++) {
    const nearest: MergeCandidatePair[] = []
    for (let j = i + 1; j < clusters.length; j++) {
      const leftVector = vectors[i]
      const rightVector = vectors[j]
      const left = clusters[i]
      const right = clusters[j]
      if (!leftVector || !rightVector || !left || !right) continue
      const similarity = cosineSimilarityNormalized(leftVector, rightVector)
      const similarityNominated = similarity >= similarityFloor
      // Name-duplicate nomination: heavy name overlap with a sane centroid
      // floor; the judge still decides.
      const nameNominated =
        !similarityNominated &&
        similarity >= TAXONOMY_MERGE_NAME_NOMINATION_MIN_SIMILARITY &&
        isDisplayableTaxonomyName(left.name) &&
        isDisplayableTaxonomyName(right.name) &&
        namesOverlap(left.name, right.name)
      if (similarityNominated || nameNominated) nearest.push({ left, right, similarity })
    }
    for (const pair of nearest.sort((a, b) => b.similarity - a.similarity).slice(0, TAXONOMY_MERGE_NEAREST_NEIGHBORS)) {
      const key = [pair.left.id, pair.right.id].sort().join(":")
      pairsByKey.set(key, pair)
    }
  }
  return [...pairsByKey.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TAXONOMY_MERGE_CANDIDATES_PER_PARENT)
}

const mergeJudgeSchema = z.object({ sameBehavior: z.boolean() })

const hasJudgeableIdentity = (cluster: TaxonomyCluster): boolean =>
  isDisplayableTaxonomyName(cluster.name) && cluster.description.trim().length > 0

/**
 * LLM merge judge. Centroid cosine nominates candidate pairs but carries no
 * merge signal in the 0.86–0.92 band on dense corpora (QA: the worst wrong
 * pair outscored true duplicates), so the judge decides from names and
 * descriptions. Conservative on failure: an unanswered pair is not merged
 * this run — centroids drift slowly, so the next run retries.
 */
const judgeSameBehavior = (pair: MergeCandidatePair) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const result = yield* ai.generate({
      provider: TAXONOMY_JUDGE_MODEL.provider,
      model: TAXONOMY_JUDGE_MODEL.model,
      system: `You are a merge judge: decide whether two conversation topic clusters describe the same topic, such that keeping both adds no analytical value. Clusters describing the same task done via different methods, identifiers, or channels ARE the same topic (for example verifying an account with name+phone vs email vs name+ZIP are all one "account verification" topic). A cluster with far fewer conversations that sits inside the same domain as a much larger cluster is a fragment of that topic, not a separate topic — merge it. Only keep clusters separate when they capture different user goals (for example locating an order vs cancelling it). Return only schema-valid JSON.`,
      prompt: `Cluster A (${pair.left.observationCount} conversations): ${pair.left.name}\n${pair.left.description}\n\nCluster B (${pair.right.observationCount} conversations): ${pair.right.name}\n${pair.right.description}\n\nReturn JSON exactly like {"sameBehavior":true} or {"sameBehavior":false}.`,
      schema: mergeJudgeSchema,
      temperature: 0,
      maxTokens: 1_000,
    })
    return result.object.sameBehavior
  }).pipe(
    Effect.timeoutOrElse({
      duration: TAXONOMY_NAMING_TIMEOUT_MS,
      orElse: () => Effect.fail(new Error("Taxonomy merge judge timed out")),
    }),
    // Conservative fallback, but never silent: a misconfigured judge (e.g.
    // missing provider credentials) rejecting every pair looks identical to
    // genuine rejections unless the failure is logged.
    Effect.tapError((error) =>
      Effect.logWarning("Taxonomy merge judge failed; pair not merged this run", {
        left: pair.left.name,
        right: pair.right.name,
        error: String(error),
      }),
    ),
    Effect.orElseSucceed(() => false),
  )

/**
 * Complete-linkage component assembly. Judge-approved pairs chain
 * transitively; a naive union once produced components whose far ends fell
 * below the similarity floor, and dropping the whole component blocked even
 * its highest-confidence merges run after run. Best pairs are applied first,
 * and a component only grows while every cross-pair still clears the floor —
 * an approved pair on its own is exempt (it was individually judged).
 */
const componentsFromApprovedPairs = (
  pairs: readonly MergeCandidatePair[],
  floor: (cluster: TaxonomyCluster) => number,
): readonly (readonly TaxonomyCluster[])[] => {
  const vectors = new Map<string, number[]>()
  const vectorOf = (cluster: TaxonomyCluster): number[] => {
    const existing = vectors.get(cluster.id)
    if (existing) return existing
    const vector = normalizeTaxonomyCentroid(cluster.centroid)
    vectors.set(cluster.id, vector)
    return vector
  }
  const setOf = new Map<string, TaxonomyCluster[]>()
  for (const pair of [...pairs].sort((a, b) => b.similarity - a.similarity)) {
    const left = setOf.get(pair.left.id) ?? [pair.left]
    const right = setOf.get(pair.right.id) ?? [pair.right]
    if (left === right) continue
    const exemptPair = left.length === 1 && right.length === 1
    const clearsFloor =
      exemptPair ||
      left.every((a) => right.every((b) => cosineSimilarityNormalized(vectorOf(a), vectorOf(b)) >= floor(pair.left)))
    if (!clearsFloor) continue
    const merged = [...left, ...right]
    for (const member of merged) setOf.set(member.id, merged)
  }
  const seen = new Set<readonly TaxonomyCluster[]>()
  const components: (readonly TaxonomyCluster[])[] = []
  for (const component of setOf.values()) {
    if (seen.has(component)) continue
    seen.add(component)
    if (component.length >= 2) components.push(component)
  }
  return components
}

const chooseSurvivor = (component: readonly TaxonomyCluster[]): TaxonomyCluster =>
  [...component].sort(
    (a, b) => b.observationCount - a.observationCount || a.id.localeCompare(b.id),
  )[0] as TaxonomyCluster

const minPairwiseSimilarity = (component: readonly TaxonomyCluster[]): number => {
  let min = 1
  for (let i = 0; i < component.length; i++) {
    for (let j = i + 1; j < component.length; j++) {
      const left = component[i]
      const right = component[j]
      if (!left || !right) continue
      min = Math.min(
        min,
        cosineSimilarityNormalized(normalizeTaxonomyCentroid(left.centroid), normalizeTaxonomyCentroid(right.centroid)),
      )
    }
  }
  return min
}

export const mergeNearDuplicateClustersUseCase = (input: MergeNearDuplicateClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* TaxonomyObservationRepository
    const active = yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension,
    })
    const parentsWithChildren = new Set(
      active.flatMap((cluster) => (cluster.parentClusterId ? [cluster.parentClusterId] : [])),
    )
    // Sibling-only: merging across parents would give a cluster two
    // ancestries and break the tree. Pairs are nominated within each parent
    // group; cross-parent near-duplicates are a parent-level signal instead.
    const siblingGroups = new Map<string, typeof active extends readonly (infer T)[] ? T[] : never>()
    for (const cluster of active) {
      const key = cluster.parentClusterId ?? "__root__"
      const group = siblingGroups.get(key) ?? []
      group.push(cluster)
      siblingGroups.set(key, group)
    }
    // Merge nomination is density-aware per level: two siblings more similar
    // than the density that created their level are one cluster at that
    // density — the judge decides. Roots use the calibrated root link;
    // children use the density their parent was split at, falling back to
    // the static floor for parents that predate split-density persistence.
    const calibration = yield* loadClusteringCalibration({ projectId: input.projectId })
    const rootFloor = calibration?.rootLinkThreshold ?? TAXONOMY_TREE_ROOT_LINK_THRESHOLD
    const parentById = new Map(active.map((cluster) => [String(cluster.id), cluster]))
    const candidates = [...siblingGroups.entries()].flatMap(([parentKey, group]) =>
      candidateMergePairs(
        group,
        parentKey === "__root__"
          ? rootFloor
          : (parentById.get(parentKey)?.splitLinkThreshold ?? TAXONOMY_MERGE_JUDGE_THRESHOLD),
      ),
    )
    const approvedPairs = (yield* Effect.forEach(
      candidates,
      (pair) =>
        Effect.gen(function* () {
          // Same-run births still carry the "Pending" placeholder, so the
          // judge has nothing to read; they use the strict similarity rule.
          if (!hasJudgeableIdentity(pair.left) || !hasJudgeableIdentity(pair.right))
            return pair.similarity >= TAXONOMY_MERGE_THRESHOLD ? pair : null
          return (yield* judgeSameBehavior(pair)) ? pair : null
        }),
      { concurrency: TAXONOMY_MERGE_JUDGE_CONCURRENCY },
    )).filter((pair): pair is MergeCandidatePair => pair !== null)
    const components = componentsFromApprovedPairs(approvedPairs, (cluster) =>
      cluster.parentClusterId === null
        ? rootFloor
        : (parentById.get(cluster.parentClusterId)?.splitLinkThreshold ?? TAXONOMY_MERGE_COMPONENT_MIN_SIMILARITY),
    )

    let clustersMerged = 0
    let observationsReassigned = 0
    const lineage: TaxonomyClusterLineage[] = []

    for (const component of components) {
      const survivor = chooseSurvivor(component)
      const survivorChildren = active.filter((cluster) => cluster.parentClusterId === survivor.id)
      const losers = component.filter((cluster) => cluster.id !== survivor.id)
      const componentParentId = survivor.parentClusterId ?? null
      if (componentParentId !== null) {
        const siblingCount = active.filter((cluster) => cluster.parentClusterId === componentParentId).length
        if (siblingCount - losers.length < TAXONOMY_TREE_MIN_CHILDREN) continue
      }
      const mergedLoserIds: TaxonomyCluster["id"][] = []
      const mergeTargets = new Set<TaxonomyCluster["id"]>()
      let reassigned = 0

      // Lock sections are deliberately single-row and bounded: the Redis
      // lock is a fixed-TTL SET NX with no lease renewal, so holding the
      // survivor lock across a whole component (bulk observation listing,
      // reassignment, subtree re-pathing) could outlive the TTL and silently
      // reopen the lost-update races the locks exist to prevent.
      for (const loser of losers) {
        // (1) Loser lock: fresh read + state check. The loser is marked merged
        // only after its sampled observations are reassigned below; otherwise a
        // capped rewrite could strand rows on an inactive cluster.
        const freshLoser = yield* withTaxonomyClusterLock(
          {
            organizationId: input.organizationId,
            clusterId: loser.id,
            ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
          },
          Effect.gen(function* () {
            const row = yield* clusters.findById(loser.id)
            if (row.state !== "active") return null
            return row
          }),
        )
        if (freshLoser === null) continue
        if (survivorChildren.length > 0 && parentsWithChildren.has(freshLoser.id)) continue
        const assignmentTarget =
          survivorChildren.length === 0
            ? survivor
            : ([...survivorChildren].sort(
                (a, b) =>
                  cosineSimilarityNormalized(
                    normalizeTaxonomyCentroid(b.centroid),
                    normalizeTaxonomyCentroid(freshLoser.centroid),
                  ) -
                  cosineSimilarityNormalized(
                    normalizeTaxonomyCentroid(a.centroid),
                    normalizeTaxonomyCentroid(freshLoser.centroid),
                  ),
              )[0] ?? survivor)

        // (2) Unlocked heavy work: observation rows version by indexed_at. If
        // this hits the hard cap, leave the loser active and skip the merge;
        // sampled taxonomy observations should normally keep this bounded.
        const loserObservations = yield* observations.listAllByCluster({
          organizationId: input.organizationId,
          projectId: input.projectId,
          clusterId: freshLoser.id,
          limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
        })
        if (loserObservations.length >= TAXONOMY_LIST_ALL_BY_CLUSTER_MAX) continue
        yield* observations.reassignMany(
          loserObservations.map((observation) => ({
            observation,
            assignedClusterId: assignmentTarget.id,
            assignmentMethod: "gardening_reassign",
            assignmentConfidence: cosineSimilarityNormalized(
              normalizeTaxonomyCentroid(assignmentTarget.centroid),
              normalizeTaxonomyCentroid(freshLoser.centroid),
            ),
            reassignmentRunId: input.runId,
            indexedAt: now,
          })),
        )

        yield* withTaxonomyClusterLock(
          {
            organizationId: input.organizationId,
            clusterId: freshLoser.id,
            ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
          },
          Effect.gen(function* () {
            const row = yield* clusters.findById(freshLoser.id)
            if (row.state !== "active") return
            yield* clusters.markMerged({
              clusterId: freshLoser.id,
              mergedIntoClusterId: assignmentTarget.id,
              timestamp: now,
            })
          }),
        )

        // (3) Survivor adopts the loser's subtree. Sibling merges keep
        // depth, so only the path prefix and the direct children's parent
        // pointer change. Each descendant saves under its own lock — live
        // assignment increments descendant counters concurrently.
        const freshSurvivorForPath = yield* clusters.findById(assignmentTarget.id)
        const loserPrefix = `${freshLoser.path}${freshLoser.id}/`
        const survivorPrefix = `${freshSurvivorForPath.path}${freshSurvivorForPath.id}/`
        for (const descendant of active.filter((cluster) => cluster.path.startsWith(loserPrefix))) {
          yield* withTaxonomyClusterLock(
            {
              organizationId: input.organizationId,
              clusterId: descendant.id,
              ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
            },
            Effect.gen(function* () {
              const fresh = yield* clusters.findById(descendant.id)
              yield* clusters.save({
                ...fresh,
                parentClusterId: fresh.parentClusterId === loser.id ? assignmentTarget.id : fresh.parentClusterId,
                path: `${survivorPrefix}${fresh.path.slice(loserPrefix.length)}`,
                updatedAt: now,
              })
            }),
          )
        }

        // (4) Target lock, briefly: fresh read + centroid merge + counters.
        yield* withTaxonomyClusterLock(
          {
            organizationId: input.organizationId,
            clusterId: assignmentTarget.id,
            ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
          },
          Effect.gen(function* () {
            const freshTarget = yield* clusters.findById(assignmentTarget.id)
            const mergedCentroid = mergeTaxonomyCentroids({
              survivor: { ...freshTarget.centroid, clusteredAt: freshTarget.clusteredAt },
              loser: { ...freshLoser.centroid, clusteredAt: freshLoser.clusteredAt },
              timestamp: now,
            })
            yield* clusters.save({
              ...freshTarget,
              centroid: mergedCentroid,
              clusteredAt: mergedCentroid.clusteredAt,
              observationCount: freshTarget.observationCount + freshLoser.observationCount,
              lastObservedAt:
                freshLoser.lastObservedAt > freshTarget.lastObservedAt
                  ? freshLoser.lastObservedAt
                  : freshTarget.lastObservedAt,
              updatedAt: now,
            })
          }),
        )

        mergedLoserIds.push(freshLoser.id)
        mergeTargets.add(assignmentTarget.id)
        reassigned += loserObservations.length
      }

      if (mergedLoserIds.length === 0) continue
      clustersMerged += mergedLoserIds.length
      observationsReassigned += reassigned
      lineage.push({
        id: TaxonomyLineageId(generateId()),
        organizationId: input.organizationId,
        projectId: input.projectId,
        dimension: survivor.dimension,
        runId: input.runId,
        transitionType: "merge",
        // Only losers that actually merged this run: a loser skipped at the
        // state check (already merged/deprecated) must not appear in lineage.
        fromClusterIds: mergedLoserIds,
        toClusterIds: [...mergeTargets],
        similarity: minPairwiseSimilarity(component),
        createdAt: now,
      })
    }

    return { clustersMerged, observationsReassigned, lineage } satisfies MergeNearDuplicateClustersResult
  }).pipe(Effect.withSpan("taxonomy.mergeNearDuplicateClusters"))
