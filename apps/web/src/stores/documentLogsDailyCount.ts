import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { DailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import useSWR, { SWRConfiguration } from 'swr'

type DailyCountWithDate = Omit<DailyCount, 'date'> & { date: Date }
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
  const fetcher = useFetcher<DailyCountWithDate[], DailyCount[]>(
    disable
      ? undefined
      : documentUuid
        ? ROUTES.api.projects
            .detail(projectId)
            .documents.detail(documentUuid)
            .logs.dailyCount({ days, filterOptions })
        : undefined,
    {
      serializer: (rows) =>
        rows.map((row) => ({
          ...row,
          date: new Date(row.date),
        })),
    },
  )

  const { data, isLoading, error } = useSWR<DailyCountWithDate[]>(
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
