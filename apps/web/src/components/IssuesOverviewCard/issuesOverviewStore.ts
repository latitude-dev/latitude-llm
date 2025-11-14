import { IssuesOverviewResponse } from '$/app/api/projects/[projectId]/issues/overview/route'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { useMemo } from 'react'
import useSWR, { SWRConfiguration } from 'swr'

const EMPTY_OVERVIEW: IssuesOverviewResponse = {
  issuesCount: 0,
  annotatedCount: 0,
}
export function useIssuesOverview(
  {
    projectId,
  }: {
    projectId: number
  },
  swrConfig?: SWRConfiguration<IssuesOverviewResponse, any>,
) {
  const route = ROUTES.api.projects.detail(projectId).issues.overview.root
  const fetcher = useFetcher<IssuesOverviewResponse, IssuesOverviewResponse>(
    route,
  )
  const { data = EMPTY_OVERVIEW, isLoading } = useSWR<IssuesOverviewResponse>(
    ['issues-overview', projectId],
    fetcher,
    swrConfig,
  )

  return useMemo(
    () => ({
      data,
      isLoading,
    }),
    [data, isLoading],
  )
}
