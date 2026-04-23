import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { TraceRepository } from "../ports/trace-repository.ts"
import { buildTraceMetricBaselines, type TraceCohortSummary } from "../trace-cohorts.ts"

export interface GetTraceCohortSummaryByTagsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly tags: ReadonlyArray<string>
}

export const getTraceCohortSummaryByTagsUseCase = Effect.fn("spans.getTraceCohortSummaryByTags")(function* (
  input: GetTraceCohortSummaryByTagsInput,
) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("tagsLength", input.tags.length)

  const traceRepository = yield* TraceRepository
  const baselineData = yield* traceRepository.getCohortBaselineByTags({
    organizationId: input.organizationId,
    projectId: input.projectId,
    tags: input.tags,
  })
  const baselines = buildTraceMetricBaselines(baselineData)

  return {
    traceCount: baselineData.traceCount,
    baselines,
  } satisfies TraceCohortSummary
})
