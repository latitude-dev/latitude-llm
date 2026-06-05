import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { MonitorRepository } from "../ports/monitor-repository.ts"

/**
 * Batched lookup for the saved-search dropdown's "View monitor" deep-link: for every saved search
 * watched by a live, unmuted monitor in the project, the slug of the earliest-created such monitor.
 */
export const listSavedSearchMonitorSlugsUseCase = Effect.fn("monitors.listSavedSearchMonitorSlugs")(function* (input: {
  readonly projectId: ProjectId
}) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  const repo = yield* MonitorRepository
  return yield* repo.listSavedSearchMonitorSlugs(input.projectId)
})
