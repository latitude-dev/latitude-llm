import type { FilterSet, NotFoundError, OrganizationId, ProjectId, RepositoryError, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { resolveTraceCohortFilters } from "../helpers.ts"
import { TraceRepository } from "../ports/trace-repository.ts"
import { buildTraceMetricBaselines, evaluateTraceResourceOutliers } from "../trace-cohorts.ts"

export interface EvaluateTraceResourceOutliersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly filters?: FilterSet
}

export type EvaluateTraceResourceOutliersError = NotFoundError | RepositoryError

export const evaluateTraceResourceOutliersUseCase = (input: EvaluateTraceResourceOutliersInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository
    const trace = yield* traceRepository.findByTraceId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
    })
    const effectiveFilters = resolveTraceCohortFilters(input.filters, trace.startTime.getTime()).effectiveFilters
    const baselineData = yield* traceRepository.getCohortBaselineByProjectId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      filters: effectiveFilters,
      excludeTraceId: input.traceId,
    })

    return evaluateTraceResourceOutliers(trace, buildTraceMetricBaselines(baselineData))
  })
