import { DailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { DocumentLogFilterOptions } from '@latitude-data/core/browser'

type DailyCountWithDate = Omit<DailyCount, 'date'> & { date: Date }
export default function useDocumentLogsDailyCount(
  {
    documentUuid,
    filterOptions,
    projectId,
    days,
  }: {
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
    projectId: number
    days?: number
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<DailyCountWithDate[], DailyCount[]>(
    documentUuid
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
