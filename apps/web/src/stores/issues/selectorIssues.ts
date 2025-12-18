import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import useFetcher from '$/hooks/useFetcher'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useMemo } from 'react'
import { SearchIssueResponse } from '$/app/api/projects/[projectId]/documents/[documentUuid]/issues/search/route'
import { IssueGroup } from '@latitude-data/constants/issues'

function createSearchIssuesKey({
  projectId,
  commitUuid,
  documentUuid,
  query,
  group,
}: {
  projectId: number
  commitUuid: string
  documentUuid: string
  query?: string
  group?: IssueGroup
}) {
  const base = ['searchIssues', projectId, documentUuid, commitUuid]
  if (group) {
    base.push(group)
  }

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
    group,
  }: {
    projectId: number
    documentUuid: string
    commitUuid: string
    query?: string
    group?: IssueGroup
  },
  swrConfig?: SWRConfiguration<SearchIssueResponse, any>,
) {
  const base = ROUTES.api.projects
    .detail(projectId)
    .documents.detail(documentUuid)
  const route = base.issues.search
  const fetcher = useFetcher<SearchIssueResponse>(route, {
    searchParams: {
      documentUuid,
      commitUuid,
      query: query ?? '',
      group: group ?? '',
    },
  })
  const { data = EMPTY_LIST, isLoading } = useSWR<SearchIssueResponse>(
    createSearchIssuesKey({
      projectId,
      documentUuid,
      commitUuid,
      query,
      group,
    }),
    fetcher,
    { keepPreviousData: true, ...swrConfig },
  )

  return useMemo(() => ({ data, isLoading }), [data, isLoading])
}
