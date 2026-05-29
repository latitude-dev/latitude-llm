import { generateId, type OrganizationId, type ProjectId, TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_GARDEN_LOCK_TTL_SECONDS,
  TAXONOMY_GARDENING_MAX_RUNTIME_MS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
} from "../constants.ts"
import type { TaxonomyClusterLineage, TaxonomyRunTrigger } from "../entities/lineage.ts"
import { TaxonomyGardeningTimeoutError } from "../errors.ts"
import { withTaxonomyGardenLock } from "../locks.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyCategoryRepository } from "../ports/taxonomy-category-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyRunRepository } from "../ports/taxonomy-run-repository.ts"
import { deprecateInactiveClustersUseCase } from "./deprecate-inactive-clusters.ts"
import { emitLineageUseCase } from "./emit-lineage.ts"
import { mergeNearDuplicateClustersUseCase } from "./merge-near-duplicate-clusters.ts"
import { nameCategoryUseCase, nameClusterUseCase } from "./name-taxonomy.ts"
import { reassignNoiseToCurrentClustersUseCase } from "./reassign-noise-to-current-clusters.ts"
import { rebuildCategoryHierarchyUseCase } from "./rebuild-category-hierarchy.ts"
import { sweepNoiseAndBirthClustersUseCase } from "./sweep-noise-and-birth-clusters.ts"

export interface RunProjectGardeningInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly trigger: TaxonomyRunTrigger
  readonly now?: Date
}

const gardeningLookbackStart = (now: Date): Date =>
  new Date(now.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

const errorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string")
    return error._tag
  if (error instanceof Error) return error.message
  return String(error)
}

// TODO(taxonomy): move gardening to a Temporal workflow. The orchestrator
// below spans Postgres + ClickHouse writes (births, merges, reassignments,
// hierarchy rebuild) under a single Redis lock with no resumability — a
// worker kill or 30s cluster-lock TTL expiry mid-merge leaves half-applied
// state. Each step (birth, merge, deprecate, reassign, hierarchy, naming)
// becomes an idempotent activity; the workflow ID
// `taxonomy:garden:${orgId}:${projectId}` replaces the garden lock. See
// `.agents/skills/temporal-developer/SKILL.md`.
export const runProjectGardeningUseCase = (input: RunProjectGardeningInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    const runs = yield* TaxonomyRunRepository
    const clusters = yield* TaxonomyClusterRepository
    const categories = yield* TaxonomyCategoryRepository
    const observations = yield* BehaviorObservationRepository
    const startedAt = input.now ?? new Date()
    const runId = TaxonomyRunId(generateId())
    const initialRun = {
      id: runId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      trigger: input.trigger,
      status: "running" as const,
      startedAt,
      completedAt: null,
      observationsScanned: 0,
      noiseScanned: 0,
      clustersBorn: 0,
      clustersMerged: 0,
      clustersDeprecated: 0,
      categoriesRebuilt: 0,
      error: null,
    }

    return yield* withTaxonomyGardenLock(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        ttlSeconds: TAXONOMY_GARDEN_LOCK_TTL_SECONDS,
      },
      Effect.gen(function* () {
        yield* runs.insert(initialRun)

        const completed = yield* Effect.gen(function* () {
          const now = startedAt
          const lineage: TaxonomyClusterLineage[] = []
          const observationCounts = yield* observations.getCounts({
            organizationId: input.organizationId,
            projectId: input.projectId,
            since: gardeningLookbackStart(now),
          })

          const births = yield* sweepNoiseAndBirthClustersUseCase({
            organizationId: input.organizationId,
            projectId: input.projectId,
            runId,
            now,
          })
          lineage.push(...births.lineage)

          const merges = yield* mergeNearDuplicateClustersUseCase({
            organizationId: input.organizationId,
            projectId: input.projectId,
            runId,
            now,
          })
          lineage.push(...merges.lineage)

          const deaths = yield* deprecateInactiveClustersUseCase({
            organizationId: input.organizationId,
            projectId: input.projectId,
            runId,
            now,
          })
          lineage.push(...deaths.lineage)

          const reassign = yield* reassignNoiseToCurrentClustersUseCase({
            organizationId: input.organizationId,
            projectId: input.projectId,
            runId,
            now,
          })

          const hierarchy = yield* rebuildCategoryHierarchyUseCase({
            organizationId: input.organizationId,
            projectId: input.projectId,
            now,
          })

          const bornClusterIds = new Set(
            lineage.flatMap((row) => (row.transitionType === "birth" ? row.toClusterIds : [])),
          )
          const activeClusters = yield* clusters.listActiveByProject({
            projectId: input.projectId,
          })
          for (const cluster of activeClusters) {
            if (bornClusterIds.has(cluster.id) || cluster.name === "Pending") {
              yield* nameClusterUseCase({
                organizationId: input.organizationId,
                projectId: input.projectId,
                clusterId: cluster.id,
                now,
              })
            }
          }

          const activeCategories = yield* categories.listByProject({
            projectId: input.projectId,
            state: "active",
          })
          for (const category of activeCategories) {
            if (category.name === "Pending") {
              yield* nameCategoryUseCase({
                organizationId: input.organizationId,
                projectId: input.projectId,
                categoryId: category.id,
                now,
              })
            }
          }

          yield* emitLineageUseCase({ transitions: lineage })

          return {
            ...initialRun,
            status: "completed" as const,
            completedAt: new Date(),
            observationsScanned: observationCounts.total,
            noiseScanned: births.noiseScanned + reassign.noiseScanned,
            clustersBorn: births.clustersBorn,
            clustersMerged: merges.clustersMerged,
            clustersDeprecated: deaths.clustersDeprecated,
            categoriesRebuilt: hierarchy.categoriesRebuilt,
          }
        }).pipe(
          Effect.timeoutOrElse({
            duration: TAXONOMY_GARDENING_MAX_RUNTIME_MS,
            orElse: () => Effect.fail(new TaxonomyGardeningTimeoutError({ projectId: input.projectId, runId })),
          }),
          Effect.catch((error) => {
            const failedRun = {
              ...initialRun,
              status: "failed" as const,
              completedAt: new Date(),
              error: errorMessage(error),
            }
            return runs.save(failedRun).pipe(Effect.flatMap(() => Effect.fail(error)))
          }),
        )

        yield* runs.save(completed)
        return completed
      }),
    )
  }).pipe(Effect.withSpan("taxonomy.gardenProject"))
