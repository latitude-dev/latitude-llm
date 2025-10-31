import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import useFetcher from '$/hooks/useFetcher'
import { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { useMemo } from 'react'

export function useIssue(
  {
    projectId,
    commitUuid,
    issueId,
  }: {
    projectId: number
    commitUuid: string
    issueId?: number | null
  },
  swrConfig?: SWRConfiguration<Issue, any>,
) {
  const base = ROUTES.api.projects.detail(projectId).commits.detail(commitUuid)
  const route = issueId ? base.issues.detail(issueId).root : undefined
  const fetcher = useFetcher<Issue>(route ? route : undefined)
  const { data, isLoading } = useSWR<Issue>(
    ['issueByProject', projectId, commitUuid, issueId],
    fetcher,
    swrConfig,
  )
  return useMemo(() => ({ data, isLoading }), [data, isLoading])
}
