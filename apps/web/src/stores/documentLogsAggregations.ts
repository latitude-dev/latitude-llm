import { DocumentLogsAggregations } from '@latitude-data/core/services/documentLogs/computeDocumentLogsAggregations'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogsAggregations(
  {
    documentUuid,
    commitUuid,
    projectId,
  }: {
    documentUuid: string
    commitUuid: string
    projectId: number
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid).documentLogs.aggregations,
  )

  const { data, isLoading, error, mutate } = useSWR<DocumentLogsAggregations>(
    ['documentLogsAggregations', documentUuid, commitUuid, projectId],
    fetcher,
    {
      ...opts,
      revalidateIfStale: false,
    },
  )

  return {
    data,
    isLoading,
    error,
    refetch: mutate,
  }
}
