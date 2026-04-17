import type { FilterSet, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TraceRepository } from "../ports/trace-repository.ts"
import { buildTraceMetricBaselines, type TraceCohortSummary } from "../trace-cohorts.ts"

export interface GetTraceCohortSummaryInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly filters?: FilterSet
  readonly effectiveRangeStartIso: string
  readonly effectiveRangeEndIso: string
}

export const getTraceCohortSummaryUseCase = Effect.fn("spans.getTraceCohortSummary")(function* (
  input: GetTraceCohortSummaryInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const traceRepository = yield* TraceRepository
  const baselineData = yield* traceRepository.getCohortBaselineByProjectId({
    organizationId: input.organizationId,
    projectId: input.projectId,
    ...(input.filters ? { filters: input.filters } : {}),
  })
  const baselines = buildTraceMetricBaselines(baselineData)

  return {
    effectiveRangeStartIso: input.effectiveRangeStartIso,
    effectiveRangeEndIso: input.effectiveRangeEndIso,
    traceCount: baselineData.traceCount,
    baselines,
  } satisfies TraceCohortSummary
})
