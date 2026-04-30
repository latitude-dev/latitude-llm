import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"

export const getSavedSearchBySlug = Effect.fn("savedSearches.getSavedSearchBySlug")(function* (args: {
  readonly projectId: ProjectId
  readonly slug: string
}) {
  yield* Effect.annotateCurrentSpan("projectId", args.projectId)

  const repo = yield* SavedSearchRepository
  return yield* repo.findBySlug({ projectId: args.projectId, slug: args.slug })
})
