import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { MonitorRepository } from "../ports/monitor-repository.ts"

/**
 * Batched lookup backing the saved-search ↔ monitor linkage in the UI: for every saved search
 * watched by a live, unmuted monitor in the project, the earliest-created such monitor's slug
 * (the deep-link target) plus the distinct monitor count and the watching alerts' severities.
 */
export const listSavedSearchMonitorSummariesUseCase = Effect.fn("monitors.listSavedSearchMonitorSummaries")(
  function* (input: { readonly projectId: ProjectId }) {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const repo = yield* MonitorRepository
    return yield* repo.listSavedSearchMonitorSummaries(input.projectId)
  },
)
