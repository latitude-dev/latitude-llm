import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { DailyCount } from '@latitude-data/core/services/tracing/spans/computeDocumentTracesDailyCount'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentTracesDailyCount(
  {
    documentUuid,
    commitUuid,
    projectId,
    days,
    disable,
  }: {
    documentUuid?: string
    commitUuid?: string
    projectId: number
    days?: number
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<DailyCount[]>(
    disable || !documentUuid || !commitUuid
      ? undefined
      : ROUTES.api.projects
          .detail(projectId)
          .commits.detail(commitUuid)
          .documents.detail(documentUuid)
          .traces.dailyCount({ days }),
  )

  const { data, isLoading, error } = useSWR<DailyCount[]>(
    ['documentTracesDailyCount', documentUuid, commitUuid, projectId, days],
    fetcher,
    opts,
  )

  return {
    data: data ?? [],
    isLoading,
    error,
  }
}
