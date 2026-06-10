import { SavedSearchRepository } from "@domain/saved-searches"
import { SavedSearchId, ValidationError } from "@domain/shared"
import { parseSearchQuery } from "@domain/spans"
import { Effect } from "effect"

/**
 * Why a search with a semantic part can't be monitored: semantic search ranks
 * the closest traces by meaning (a bounded, relevance-scored retrieval), not a
 * rule each trace either matches or not — so "count new matches in a window",
 * which is what every saved-search alert does, has no well-defined answer.
 */
export const SEMANTIC_SEARCH_UNMONITORABLE_MESSAGE =
  'This search has a semantic part, which finds the closest traces by meaning instead of applying an exact rule — so a monitor cannot decide which new traces match. Use only quoted "literal" or backtick `phrase` terms to monitor a search.'

/** A saved search is monitorable when its query has no semantic component (filters-only or exact phrases). */
export const savedSearchQueryIsMonitorable = (query: string | null): boolean =>
  query === null || parseSearchQuery(query).semanticPrompt.length === 0

/**
 * Loads the saved search a new or re-pointed alert wants to watch and rejects
 * it when the query contains a semantic component. Runs inside the caller's
 * transaction, so a saved search created in the same transaction is visible.
 */
export const assertMonitorableSavedSearch = (savedSearchId: string) =>
  Effect.gen(function* () {
    const repository = yield* SavedSearchRepository
    const search = yield* repository.findById(SavedSearchId(savedSearchId))
    if (!savedSearchQueryIsMonitorable(search.query)) {
      return yield* new ValidationError({ field: "source", message: SEMANTIC_SEARCH_UNMONITORABLE_MESSAGE })
    }
  })
