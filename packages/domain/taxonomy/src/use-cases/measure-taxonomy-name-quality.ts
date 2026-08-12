import type { CustomBehaviorId, FacetId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import { taxonomyNameQualityMetrics } from "../name-quality.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface MeasureTaxonomyNameQualityInput {
  readonly projectId: ProjectId
  readonly dimension?: TaxonomyDimensionType
  /** Omit/null measures the whole-project tree; an id measures that cohort's scoped tree. */
  readonly customBehaviorId?: CustomBehaviorId | null
  /** Omit/null = topic; an id measures that facet's tree. */
  readonly facetId?: FacetId | null
}

/**
 * Report-only counterpart to `assertTaxonomyQuality`: same active tree, but it
 * never fails a run, so a build that names badly is measurable instead of just
 * blocked or silently shipped.
 */
export const measureTaxonomyNameQualityUseCase = (input: MeasureTaxonomyNameQualityInput) =>
  Effect.gen(function* () {
    const clusters = yield* TaxonomyClusterRepository
    const active = yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension: input.dimension ?? TaxonomyDimension.Topic,
      customBehaviorId: input.customBehaviorId ?? null,
      facetId: input.facetId ?? null,
    })
    return taxonomyNameQualityMetrics(active)
  }).pipe(Effect.withSpan("taxonomy.measureNameQuality"))
