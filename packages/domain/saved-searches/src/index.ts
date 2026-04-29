export {
  SAVED_SEARCH_NAME_MAX_LENGTH,
  SAVED_SEARCH_QUERY_MAX_LENGTH,
  SAVED_SEARCH_SLUG_COLLISION_LIMIT,
  SAVED_SEARCH_SLUG_MAX_LENGTH,
} from "./constants.ts"
export { isEmptySearch, type SavedSearch, savedSearchSchema } from "./entities/saved-search.ts"
export {
  DuplicateSavedSearchSlugError,
  EmptySavedSearchError,
  InvalidSavedSearchNameError,
  SavedSearchNotFoundError,
} from "./errors.ts"
export {
  type SavedSearchListPage,
  SavedSearchRepository,
  type SavedSearchRepositoryShape,
} from "./ports/saved-search-repository.ts"
export { type CreateSavedSearchInput, createSavedSearch } from "./use-cases/create-saved-search.ts"
export { deleteSavedSearch } from "./use-cases/delete-saved-search.ts"
export { getSavedSearchBySlug } from "./use-cases/get-saved-search-by-slug.ts"
export { listSavedSearches } from "./use-cases/list-saved-searches.ts"
export { type UpdateSavedSearchInput, updateSavedSearch } from "./use-cases/update-saved-search.ts"
