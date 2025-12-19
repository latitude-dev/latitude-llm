'use client'

import { useCallback, useMemo } from 'react'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import type { Span, SpanType } from '@latitude-data/constants'
import type { IssueSpansResponse } from '$/app/api/projects/[projectId]/commits/[commitUuid]/issues/[issueId]/spans/route'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useCursorPagination } from '$/stores/useCursorPagination'
import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'

const EMPTY: Span<SpanType.Prompt>[] = []

export function useIssueSpans(
  {
    projectId,
    commitUuid,
    issueId,
    limit = DEFAULT_PAGINATION_SIZE,
  }: {
    projectId: number
    commitUuid: string
    issueId: number
    limit?: number
  },
  opts?: SWRConfiguration,
) {
  const {
    currentCursor,
    goToNextPage,
    goToPrevPage,
    reset,
    hasPrev,
    cursorHistoryLength,
  } = useCursorPagination()

  const route = ROUTES.api.projects
    .detail(projectId)
    .commits.detail(commitUuid)
    .issues.detail(issueId).spans.root

  const fetcher = useFetcher<IssueSpansResponse>(route, {
    serializer: (data: unknown) => {
      const result = data as IssueSpansResponse
      return {
        spans: result.spans,
        next: result.next,
      }
    },
    searchParams: compactObject({
      cursor: currentCursor ?? undefined,
      limit: limit?.toString(),
    }) as Record<string, string>,
  })

  const { data, isLoading, mutate } = useSWR<IssueSpansResponse>(
    compact([
      'issueSpans',
      projectId,
      commitUuid,
      issueId,
      currentCursor,
      limit,
    ]),
    fetcher,
    {
      ...opts,
      keepPreviousData: true,
    },
  )

  const handleGoToNextPage = useCallback(() => {
    if (data?.next && !isLoading) {
      goToNextPage(data.next)
    }
  }, [data?.next, isLoading, goToNextPage])

  return useMemo(
    () => ({
      data: data?.spans ?? EMPTY,
      hasNext: !!data?.next,
      hasPrev,
      isLoading,
      goToNextPage: handleGoToNextPage,
      goToPrevPage,
      reset,
      mutate,
      currentCursor,
      cursorHistoryLength,
    }),
    [
      data,
      hasPrev,
      isLoading,
      handleGoToNextPage,
      goToPrevPage,
      reset,
      mutate,
      currentCursor,
      cursorHistoryLength,
    ],
  )
}
