import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"

const DEFAULT_SEARCH_LIMIT = 8

/**
 * Org-wide dataset name search for the Command Palette. Delegates to the repository's org-scoped
 * search (RLS-bound to the caller's organization); results span every project in the org and carry
 * their owning project's slug/name.
 */
export const searchDatasets = Effect.fn("datasets.searchDatasets")(function* (args: {
  readonly searchQuery?: string
  readonly limit?: number
}) {
  const repo = yield* DatasetRepository
  return yield* repo.searchOrgWide({
    ...(args.searchQuery !== undefined ? { searchQuery: args.searchQuery } : {}),
    limit: args.limit ?? DEFAULT_SEARCH_LIMIT,
  })
})
