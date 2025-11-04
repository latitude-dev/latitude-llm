'use client'

import { useMemo } from 'react'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { IssueEvaluationResultsResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/results/route'

export type IssueEvaluationResult =
  IssueEvaluationResultsResponse['results'][number]

const EMPTY_RESULTS: IssueEvaluationResult[] = []
export function useIssueEvaluationResults(
  {
    projectId,
    commitUuid,
    issueId,
    page = 1,
    pageSize = 10,
  }: {
    projectId: number
    commitUuid: string
    issueId: number
    page?: number
    pageSize?: number
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects
    .detail(projectId)
    .commits.detail(commitUuid)
    .issues.detail(issueId).results.root

  const fetcher = useFetcher<IssueEvaluationResultsResponse>(route, {
    searchParams: { page: page.toString(), pageSize: pageSize.toString() },
  })

  const { data, isLoading } = useSWR<IssueEvaluationResultsResponse>(
    compact([
      'issueEvaluationResults',
      projectId,
      commitUuid,
      issueId,
      page,
      pageSize,
    ]),
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data: data?.results ?? EMPTY_RESULTS,
      hasNextPage: data?.hasNextPage ?? false,
      isLoading,
    }),
    [data, isLoading],
  )
}
