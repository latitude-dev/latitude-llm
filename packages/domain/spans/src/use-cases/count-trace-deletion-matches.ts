import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { withTraceDeletionCutoff } from "../entities/trace-deletion-request.ts"
import { TraceRepository } from "../ports/trace-repository.ts"
import { resolveTraceDeletionFilters, type TraceDeletionSelectorInput } from "./create-trace-deletion-request.ts"

/** The dry run of a deletion: how many traces the selector matches right now. */
export const countTraceDeletionMatchesUseCase = Effect.fn("spans.countTraceDeletionMatches")(function* (
  input: TraceDeletionSelectorInput & {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
  },
) {
  const filters = yield* resolveTraceDeletionFilters(input)
  const traces = yield* TraceRepository
  return yield* traces.countByProjectId({
    organizationId: input.organizationId,
    projectId: input.projectId,
    filters: withTraceDeletionCutoff(filters, new Date()),
  })
})
