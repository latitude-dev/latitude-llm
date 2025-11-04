import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import useFetcher from '$/hooks/useFetcher'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useMemo } from 'react'
import { SearchIssueResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/search/route'

export function createSearchIssuesKey({
  projectId,
  commitUuid,
  documentUuid,
  query,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
  query?: string
}) {
  const base = ['searchIssues', projectId, commitUuid, documentUuid]

  if (!query) return base

  return [...base, query]
}

const EMPTY_LIST: Issue[] = []

export function useSearchIssues(
  {
    projectId,
    commitUuid,
    documentUuid,
    query,
  }: {
    projectId: number
    commitUuid: string
    documentUuid: string
    query?: string
  },
  swrConfig?: SWRConfiguration<SearchIssueResponse, any>,
) {
  const base = ROUTES.api.projects.detail(projectId).commits.detail(commitUuid)
  const route = base.issues.search
  const fetcher = useFetcher<SearchIssueResponse>(route, {
    searchParams: { documentUuid, query: query ?? '' },
  })
  const { data = EMPTY_LIST, isLoading } = useSWR<SearchIssueResponse>(
    createSearchIssuesKey({ projectId, commitUuid, documentUuid, query }),
    fetcher,
    swrConfig,
  )

  return useMemo(() => ({ data, isLoading }), [data, isLoading])
}
