import type { ProjectId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"

export const listSavedSearches = Effect.fn("savedSearches.listSavedSearches")(function* (args: {
  readonly projectId: ProjectId
  readonly assignedUserId?: UserId
}) {
  yield* Effect.annotateCurrentSpan("projectId", args.projectId)

  const repo = yield* SavedSearchRepository
  return yield* repo.listByProject(
    args.assignedUserId !== undefined
      ? { projectId: args.projectId, assignedUserId: args.assignedUserId }
      : { projectId: args.projectId },
  )
})
