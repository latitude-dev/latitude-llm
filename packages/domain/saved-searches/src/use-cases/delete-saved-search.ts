import type { SavedSearchId } from "@domain/shared"
import { Effect } from "effect"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"

export const deleteSavedSearch = Effect.fn("savedSearches.deleteSavedSearch")(function* (args: {
  readonly savedSearchId: SavedSearchId
}) {
  yield* Effect.annotateCurrentSpan("savedSearchId", args.savedSearchId)

  const repo = yield* SavedSearchRepository
  yield* repo.findById(args.savedSearchId)
  yield* repo.softDelete(args.savedSearchId)
})
