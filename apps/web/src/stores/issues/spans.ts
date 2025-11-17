'use client'

import { useMemo } from 'react'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { Span as EMPTY_SPANS, SpanType } from '@latitude-data/constants'
import { IssueSpansResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/spans/route'

const EMPTY: EMPTY_SPANS<SpanType.Prompt>[] = []

export function useIssueSpans(
  {
    projectId,
    commitUuid,
    issueId,
    page = 1,
    pageSize = 25,
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
    .issues.detail(issueId).spans.root

  const fetcher = useFetcher<IssueSpansResponse>(route, {
    searchParams: { page: page.toString(), pageSize: pageSize.toString() },
  })

  const { data, isLoading } = useSWR<IssueSpansResponse>(
    compact(['issueSpans', projectId, commitUuid, issueId, page, pageSize]),
    fetcher,
    opts,
  )

  return useMemo(
    () => ({
      data: data?.spans ?? EMPTY,
      hasNextPage: data?.hasNextPage ?? false,
      isLoading,
    }),
    [data, isLoading],
  )
}
