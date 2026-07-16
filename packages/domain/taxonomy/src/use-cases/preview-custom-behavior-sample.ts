import type { FilterSet, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { CUSTOM_BEHAVIOR_LOOKBACK_DAYS, TAXONOMY_GARDENING_MIN_OBSERVATIONS } from "../constants.ts"
import { customBehaviorFilterSetSchema } from "../entities/custom-behavior.ts"
import { CustomBehaviorFilterInvalidError } from "../errors.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

export interface PreviewCustomBehaviorSampleInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly filterSet: FilterSet
  readonly now?: Date
}

export interface PreviewCustomBehaviorSampleResult {
  readonly sessionCount: number
  readonly observationCount: number
  /** Minimum observations a scoped taxonomy build needs; below it the behavior can't generate. */
  readonly minObservations: number
  readonly isReady: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

export const previewCustomBehaviorSampleUseCase = (input: PreviewCustomBehaviorSampleInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const parsed = customBehaviorFilterSetSchema.safeParse(input.filterSet)
    if (!parsed.success) {
      return yield* new CustomBehaviorFilterInvalidError({
        message: parsed.error.issues[0]?.message ?? "Invalid filter set",
      })
    }

    const now = input.now ?? new Date()
    const since = new Date(now.getTime() - CUSTOM_BEHAVIOR_LOOKBACK_DAYS * DAY_MS)

    const observations = yield* TaxonomyObservationRepository
    const counts = yield* observations.countForCustomBehaviorSample({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since,
      filterSet: parsed.data,
    })

    return {
      sessionCount: counts.sessionCount,
      observationCount: counts.observationCount,
      minObservations: TAXONOMY_GARDENING_MIN_OBSERVATIONS,
      isReady: counts.observationCount >= TAXONOMY_GARDENING_MIN_OBSERVATIONS,
    } satisfies PreviewCustomBehaviorSampleResult
  }).pipe(Effect.withSpan("taxonomy.previewCustomBehaviorSample"))
