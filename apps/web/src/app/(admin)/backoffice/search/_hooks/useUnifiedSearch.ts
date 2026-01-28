'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

const MIN_QUERY_LENGTH = 2
const EMPTY_RESULTS: UnifiedSearchResponse = {
  users: [],
  workspaces: [],
  projects: [],
}

export type UserSearchResult = {
  type: 'user'
  id: string
  email: string
  name: string | null
  createdAt: string
}

export type WorkspaceSearchResult = {
  type: 'workspace'
  id: number
  name: string
  createdAt: string
}

export type ProjectSearchResult = {
  type: 'project'
  id: number
  name: string
  workspaceId: number
  createdAt: string
}

export type UnifiedSearchResponse = {
  users: UserSearchResult[]
  workspaces: WorkspaceSearchResult[]
  projects: ProjectSearchResult[]
}

export type EntityType = 'all' | 'user' | 'workspace' | 'project'

export function useUnifiedSearch(
  query: string,
  entityType: EntityType = 'all',
) {
  const [results, setResults] = useState<UnifiedSearchResponse>(EMPTY_RESULTS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const trimmedQuery = query.trim()
  const isQueryTooShort =
    trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH

  const debouncedSearch = useCallback(
    async (searchQuery: string, type: EntityType) => {
      const trimmed = searchQuery.trim()

      if (trimmed.length < MIN_QUERY_LENGTH) {
        setResults(EMPTY_RESULTS)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          q: trimmed,
          type: type,
        })
        const response = await fetch(`/api/admin/search?${params}`)

        if (!response.ok) {
          throw new Error('Search failed')
        }

        const data = await response.json()
        setResults(data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Search failed'))
        setResults(EMPTY_RESULTS)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      debouncedSearch(query, entityType)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query, entityType, debouncedSearch])

  const hasResults = useMemo(() => {
    return (
      results.users.length > 0 ||
      results.workspaces.length > 0 ||
      results.projects.length > 0
    )
  }, [results])

  const totalCount = useMemo(() => {
    return (
      results.users.length + results.workspaces.length + results.projects.length
    )
  }, [results])

  return {
    results,
    isLoading,
    error,
    hasResults,
    totalCount,
    isQueryTooShort,
  }
}
