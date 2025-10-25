import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { IssuesServerResponse } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/issues/page'

const EMPTY_RESPONSE: IssuesServerResponse = {
  issues: [],
  prevCursor: undefined,
  nextCursor: undefined,
}

// TODO: make a zustand store that keeps
// 1. sorting
// 2. filters
// ready to use as URL params
// And also update the SWR key to include those params

export function useIssues(
  {
    data: { commitUuid, projectId, searchParams },
    onSuccess,
  }: {
    data: {
      projectId: number
      commitUuid: string
      searchParams: any // Zustand state
      issuesKey: string // Zustand state
    }
    onSuccess: (data: IssuesServerResponse | void) => void
  },
  swrConfig?: SWRConfiguration,
) {
  const fetcher = useFetcher<IssuesServerResponse>(
    ROUTES.api.projects.detail(projectId).issues.root,
    {
      onSuccess: (data) => {
        if (!data) return
        onSuccess(data)
      },
      searchParams,
    },
  )

  const { data = EMPTY_RESPONSE, isLoading } = useSWR<IssuesServerResponse>(
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
      isLoading,
    }),
    [data, isLoading],
  )
}
