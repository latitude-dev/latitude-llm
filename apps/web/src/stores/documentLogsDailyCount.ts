import { DailyCount } from '@latitude-data/core/services/documentLogs/computeDocumentLogsDailyCount'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogsDailyCount(
  {
    documentUuid,
    commitUuid,
    projectId,
    days,
  }: {
    documentUuid: string
    commitUuid: string
    projectId: number
    days?: number
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid).documentLogs.dailyCount,
    {
      searchParams: days ? { days: days.toString() } : undefined,
      serializer: (rows: DailyCount[]) =>
        rows.map((row) => ({
          ...row,
          date: new Date(row.date),
        })),
    },
  )

  const { data, isLoading, error } = useSWR<(DailyCount & { date: Date })[]>(
    ['documentLogsDailyCount', documentUuid, commitUuid, projectId, days],
    fetcher,
    opts,
  )

  return {
    data: data ?? [],
    isLoading,
    error,
  }
}
