import type { RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { emptyUnifiedSearchResult, type SearchEntityType, type UnifiedSearchResult } from "../entities/search-result.ts"
import { AdminSearchRepository } from "../ports/admin-search-repository.ts"

export const MIN_SEARCH_QUERY_LENGTH = 2
export const MAX_SEARCH_QUERY_LENGTH = 100

const getRelevanceScore = (value: string, query: string): number => {
  const lowerValue = value.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerValue === lowerQuery) return 100
  if (lowerValue.startsWith(lowerQuery)) return 50
  return 10
}

const sortByRelevance = <T>(items: readonly T[], query: string, fields: (item: T) => readonly string[]): T[] => {
  return [...items].sort((a, b) => {
    const aScore = Math.max(...fields(a).map((field) => getRelevanceScore(field, query)))
    const bScore = Math.max(...fields(b).map((field) => getRelevanceScore(field, query)))
    return bScore - aScore
  })
}

export interface UnifiedSearchInput {
  readonly query: string
  readonly entityType: SearchEntityType
}

export const unifiedSearchUseCase = (
  input: UnifiedSearchInput,
): Effect.Effect<UnifiedSearchResult, RepositoryError, AdminSearchRepository> =>
  Effect.gen(function* () {
    const trimmed = input.query.trim()
    yield* Effect.annotateCurrentSpan("admin.searchQueryLength", trimmed.length)
    yield* Effect.annotateCurrentSpan("admin.searchEntityType", input.entityType)

    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      return emptyUnifiedSearchResult()
    }

    const repo = yield* AdminSearchRepository
    const results = yield* repo.unifiedSearch(trimmed, input.entityType)

    return {
      users: sortByRelevance(results.users, trimmed, (u) => [u.email, u.name ?? ""]),
      organizations: sortByRelevance(results.organizations, trimmed, (o) => [o.name, o.slug, o.id]),
      projects: sortByRelevance(results.projects, trimmed, (p) => [p.name, p.slug, p.id]),
    }
  }).pipe(Effect.withSpan("admin.unifiedSearch"))
