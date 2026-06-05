import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"

export const listSavedSearches = Effect.fn("savedSearches.listSavedSearches")(function* (args: {
  readonly projectId: ProjectId
}) {
  yield* Effect.annotateCurrentSpan("projectId", args.projectId)

  const repo = yield* SavedSearchRepository
  return yield* repo.listByProject({ projectId: args.projectId })
})
