import type { FilterSet, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { TraceCohortUnavailableError } from "../errors.ts"
import { TraceRepository } from "../ports/trace-repository.ts"
import { buildTraceCohortListingSpec, buildTraceMetricBaselines, type TraceCohortKey } from "../trace-cohorts.ts"

export interface BuildTraceCohortListingSpecInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly cohort: TraceCohortKey
  readonly filters?: FilterSet
}

export type BuildTraceCohortListingSpecError = TraceCohortUnavailableError | RepositoryError

export const buildTraceCohortListingSpecUseCase = Effect.fn("spans.buildTraceCohortListingSpec")(function* (input: BuildTraceCohortListingSpecInput) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("cohort", input.cohort)

  const traceRepository = yield* TraceRepository
  const baselineData = yield* traceRepository.getCohortBaselineByProjectId({
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.filters ? { filters: input.filters } : {}),
  })
  const baselines = buildTraceMetricBaselines(baselineData)
  const spec = buildTraceCohortListingSpec(input.cohort, baselines)
  if (spec.unavailableReason) {
    return yield* new TraceCohortUnavailableError({
      cohort: input.cohort,
      reason: spec.unavailableReason,
    })
  }

  return spec
})
