import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import type { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import type { DailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import useSWR, { type SWRConfiguration } from 'swr'

export default function useDocumentLogsDailyCount(
  {
    documentUuid,
    filterOptions,
    projectId,
    days,
    disable,
  }: {
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
    projectId: number
    days?: number
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<DailyCount[]>(
    disable
      ? undefined
      : documentUuid
        ? ROUTES.api.projects
            .detail(projectId)
            .documents.detail(documentUuid)
            .logs.dailyCount({ days, filterOptions })
        : undefined,
  )

  const { data, isLoading, error } = useSWR<DailyCount[]>(
    ['documentLogsDailyCount', documentUuid, filterOptions, projectId, days],
    fetcher,
    opts,
  )

  return {
    data: data ?? [],
    isLoading,
    error,
  }
}
