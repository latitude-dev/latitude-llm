import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import useFetcher from '$/hooks/useFetcher'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useMemo } from 'react'
import { SearchIssueResponse } from '$/app/api/projects/[projectId]/documents/[documentUuid]/issues/search/route'
import { IssueGroup, IssueStatuses } from '@latitude-data/constants/issues'

export function createSearchIssuesKey({
  projectId,
  documentUuid,
  query,
  statuses,
  group,
}: {
  projectId: number
  documentUuid: string
  query?: string
  statuses?: IssueStatuses[]
  group?: IssueGroup
}) {
  const base = ['searchIssues', projectId, documentUuid]
  if (statuses) {
    base.push(...statuses)
  }
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
    documentUuid,
    query,
    statuses,
    group,
  }: {
    projectId: number
    documentUuid: string
    query?: string
    statuses?: IssueStatuses[]
    group?: IssueGroup
  },
  swrConfig?: SWRConfiguration<SearchIssueResponse, any>,
) {
  const base = ROUTES.api.projects
    .detail(projectId)
    .documents.detail(documentUuid)
  const route = base.issues.search
  const issueStatusesQueryParam = statuses?.join(',')
  const fetcher = useFetcher<SearchIssueResponse>(route, {
    searchParams: {
      documentUuid,
      query: query ?? '',
      statuses: issueStatusesQueryParam ?? '',
      group: group ?? '',
    },
  })
  const { data = EMPTY_LIST, isLoading } = useSWR<SearchIssueResponse>(
    createSearchIssuesKey({ projectId, documentUuid, query, statuses, group }),
    fetcher,
    swrConfig,
  )

  return useMemo(() => ({ data, isLoading }), [data, isLoading])
}
