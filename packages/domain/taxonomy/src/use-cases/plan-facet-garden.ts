import type { CustomBehaviorId, FacetId, FilterSet, OrganizationId, ProjectId, TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import { TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX, TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS } from "../constants.ts"
import type { TaxonomyDimension } from "../entities/dimension.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import {
  TaxonomyObservationRepository,
  type TaxonomyScopedClusteringObservation,
} from "../ports/taxonomy-observation-repository.ts"
import { planHierarchicalTaxonomyUseCase, type TaxonomyClusterBuilder } from "./build-hierarchical-taxonomy.ts"
import { extractFacetProjectionsUseCase, type FacetExtractionSample } from "./extract-facet-projections.ts"

export interface PlanFacetGardenInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimension
  /** The facet to garden. */
  readonly facetId: FacetId
  /** Present ⇒ a cohort×facet view: sample only the cohort's sessions. Absent ⇒ whole-project facet. */
  readonly customBehaviorId?: CustomBehaviorId
  readonly filterSet?: FilterSet
  readonly now?: Date
  /** Offload the k-means build to a worker; omit for the in-process builder (tests). */
  readonly clusterBuilder?: TaxonomyClusterBuilder
}

const lookbackStart = (now: Date): Date =>
  new Date(now.getTime() - TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 24 * 60 * 60_000)

/**
 * Facet gardening plan: sample the facet's scope, extract (extract-if-missing)
 * its projections, drop the "unclear" ones, and cluster the rest through the
 * shared planner. The extraction side-effect (AI + projection cache) lives here,
 * not in `planHierarchicalTaxonomyUseCase`, so that planner stays a pure
 * embeddings→tree function; this use-case is the facet analogue of the topic
 * path's in-repo sampling. Always `mode: "off"` — facet clusters live in the
 * projection embedding space, where the adaptive full-window reassignment (which
 * routes the observation window) does not apply.
 */
export const planFacetGardenUseCase = (input: PlanFacetGardenInput) =>
  Effect.gen(function* () {
    const now = input.now ?? new Date()
    const facets = yield* FacetRepository
    const facet = yield* facets.findById(input.facetId)

    const observations = yield* TaxonomyObservationRepository
    const samples = yield* observations.listForFacetSample({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since: lookbackStart(now),
      limit: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
      ...(input.filterSet ? { filterSet: input.filterSet } : {}),
    })
    const extractionSamples: FacetExtractionSample[] = samples.map((s) => ({
      sessionObservationId: s.sessionObservationId,
      sessionId: s.sessionId,
      transcript: s.transcript,
      startTime: s.startTime,
    }))

    const extraction = yield* extractFacetProjectionsUseCase({ facet, samples: extractionSamples, now })
    // Unclear projections carry an empty extractedText + no embedding; exclude
    // them from clustering (the noise path).
    const facetObservations: readonly TaxonomyScopedClusteringObservation[] = extraction.projections
      .filter((projection) => projection.extractedText.length > 0 && projection.embedding.length > 0)
      .map((projection) => ({
        observationId: projection.sessionObservationId,
        sessionId: projection.sessionId,
        startTime: projection.startTime,
        embedding: projection.embedding,
      }))

    return yield* planHierarchicalTaxonomyUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      runId: input.runId,
      ...(input.dimension ? { dimension: input.dimension } : {}),
      now,
      mode: "off",
      facetId: input.facetId,
      ...(input.customBehaviorId ? { customBehaviorId: input.customBehaviorId } : {}),
      ...(input.filterSet ? { filterSet: input.filterSet } : {}),
      ...(input.clusterBuilder ? { clusterBuilder: input.clusterBuilder } : {}),
      facetObservations,
    })
  }).pipe(Effect.withSpan("taxonomy.planFacetGarden"))
