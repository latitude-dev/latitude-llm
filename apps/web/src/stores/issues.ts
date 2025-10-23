import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { RelativeDate } from '@latitude-data/core/constants'
import { SafeIssuesParams } from '@latitude-data/constants/issues'

type IssuesResponse = {
  issues: Issue[]
  hasMore: boolean
  nextCursor: string | null
}

const EMPTY_RESPONSE: IssuesResponse = {
  issues: [],
  hasMore: false,
  nextCursor: null,
}

type Params = Omit<SafeIssuesParams, 'filters'> & {
  filters: {
    documentUuid?: SafeIssuesParams['filters']['documentUuid']
    statuses?: SafeIssuesParams['filters']['statuses']
    appearanceRange?:
    | SafeIssuesParams['filters']['appearanceRange']
    | RelativeDate
  }
}

function parseAppearanceRange(filters: Params['filters']) {
  const appearanceRange = filters.appearanceRange
  if (
    !appearanceRange ||
    typeof appearanceRange === 'string' ||
    ('relative' in appearanceRange && appearanceRange.relative)
  ) {
    return {
      seenAtRelative:
        typeof appearanceRange === 'string' ? appearanceRange : '',
      seenAtFrom: '',
      seenAtTo: '',
    }
  } else {
    return {
      seenAtRelative: '',
      seenAtFrom: appearanceRange.from
        ? new Date(appearanceRange.from).toISOString()
        : '',
      seenAtTo: appearanceRange.to
        ? new Date(appearanceRange.to).toISOString()
        : '',
    }
  }
}

export function useIssues(
  {
    projectId,
    commitUuid,
    params: { filters, sort, sortDirection, cursor: cursorParam, limit },
  }: {
    projectId: number
    commitUuid: string
    params: Params
  },
  swrConfig?: SWRConfiguration,
) {
  const documentUuid = filters.documentUuid ?? ''
  const statuses = filters.statuses?.join(',') ?? ''
  const cursor = cursorParam ? String(cursorParam) : ''
  const { seenAtRelative, seenAtFrom, seenAtTo } = parseAppearanceRange(filters)

  const fetcher = useFetcher<IssuesResponse, IssuesResponse>(
    ROUTES.api.projects.detail(projectId).issues.root,
    {
      serializer: (data) => data,
      searchParams: {
        commitUuid,
        sort,
        sortDirection,
        documentUuid,
        statuses,
        seenAtRelative,
        seenAtFrom,
        seenAtTo,
        cursor,
        limit: limit.toString(),
      },
    },
  )

  const { data = EMPTY_RESPONSE, isLoading } = useSWR<IssuesResponse>(
    [
      'issues',
      projectId,
      commitUuid,
      documentUuid,
      `statuses:${statuses}`,
      `seenAtRelative:${seenAtRelative}`,
      `seenAtFrom:${seenAtFrom}`,
      `seenAtTo:${seenAtTo}`,
      `sort:${sort}`,
      `sortDirection:${sortDirection}`,
      `cursor:${cursor}`,
    ],
    fetcher,
    swrConfig,
  )

  return useMemo(
    () => ({
      data: data.issues,
      hasMore: data.hasMore,
      nextCursor: data.nextCursor,
      isLoading,
    }),
    [data, isLoading],
  )
}
