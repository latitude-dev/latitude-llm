'use client'

import { useMemo } from 'react'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { Span as EMPTY_SPANS, SpanType } from '@latitude-data/constants'

export type IssueSpansResponse = {
  logs: EMPTY_SPANS<SpanType.Prompt>[]
  hasNextPage: boolean
}

const EMPTY_LOGS: EMPTY_SPANS<SpanType.Prompt>[] = []

export function useIssueLogs(
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
    .issues.detail(issueId).logs!.root

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
      data: data?.logs ?? EMPTY_LOGS,
      hasNextPage: data?.hasNextPage ?? false,
      isLoading,
    }),
    [data, isLoading],
  )
}
