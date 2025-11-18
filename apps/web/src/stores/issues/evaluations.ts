'use client'

import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { EvaluationV2 } from '@latitude-data/core/constants'

export function useIssueEvaluations(
  {
    projectId,
    commitUuid,
    documentUuids,
  }: {
    projectId: number
    commitUuid: string
    documentUuids: string[]
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.projects.detail(projectId).commits.detail(commitUuid)
    .issues.evaluations
  const fetcher = useFetcher<EvaluationV2[]>(route, {
    searchParams: { documentUuids: documentUuids.join(',') },
  })
  const { data, isLoading } = useSWR<EvaluationV2[]>(
    ['issueEvaluations', projectId, commitUuid, documentUuids],
    fetcher,
    opts,
  )
  return { data, isLoading }
}
