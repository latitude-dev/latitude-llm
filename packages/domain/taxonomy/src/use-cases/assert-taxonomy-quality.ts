import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import { TaxonomyQualityGateError } from "../errors.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface AssertTaxonomyQualityInput {
  readonly organizationId?: OrganizationId
  readonly projectId: ProjectId
  readonly dimension?: TaxonomyDimensionType
}

export interface AssertTaxonomyQualityResult {
  readonly clustersScanned: number
  readonly findings: readonly string[]
}

const normalizedName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/**
 * Hard gates for taxonomy graph invariants that should never be presented to
 * users. Semantic quality remains judge/eval territory; these checks catch
 * stale counters and exact sibling duplicates caused by gardening bugs. Parent
 * buckets may own direct residue assignments when child splits are accepted
 * conservatively and ambiguous observations stay on the parent.
 */
export const assertTaxonomyQualityUseCase = (input: AssertTaxonomyQualityInput) =>
  Effect.gen(function* () {
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const clusters = yield* TaxonomyClusterRepository
    const active = yield* clusters.listActiveByProject({ projectId: input.projectId, dimension })
    const parentsWithChildren = new Set(
      active.flatMap((cluster) => (cluster.parentClusterId ? [cluster.parentClusterId] : [])),
    )
    const findings: string[] = []

    for (const cluster of active) {
      if (cluster.observationCount === 0 && !parentsWithChildren.has(cluster.id)) {
        findings.push(`active leaf cluster ${cluster.id} has zero current observations`)
      }
    }

    const namesBySiblingGroup = new Map<string, Map<string, string[]>>()
    for (const cluster of active) {
      const groupKey = cluster.parentClusterId ?? "__root__"
      const name = normalizedName(cluster.name)
      if (name.length === 0 || name === "pending") continue
      const group = namesBySiblingGroup.get(groupKey) ?? new Map<string, string[]>()
      const ids = group.get(name) ?? []
      ids.push(cluster.id)
      group.set(name, ids)
      namesBySiblingGroup.set(groupKey, group)
    }

    for (const [groupKey, group] of namesBySiblingGroup) {
      for (const [name, ids] of group) {
        if (ids.length > 1) findings.push(`sibling group ${groupKey} has duplicate name "${name}" on ${ids.join(",")}`)
      }
    }

    const result = { clustersScanned: active.length, findings } satisfies AssertTaxonomyQualityResult
    if (findings.length > 0) {
      return yield* new TaxonomyQualityGateError({ projectId: input.projectId, findings })
    }
    return result
  }).pipe(Effect.withSpan("taxonomy.assertQuality"))
