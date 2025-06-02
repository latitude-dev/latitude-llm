import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import {
  DocumentLogFilterOptions,
  DocumentLogsAggregations,
} from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDocumentLogsAggregations(
  {
    documentUuid,
    filterOptions,
    projectId,
    disable,
  }: {
    documentUuid?: string
    filterOptions: DocumentLogFilterOptions
    projectId: number
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<DocumentLogsAggregations>(
    disable
      ? undefined
      : documentUuid
        ? ROUTES.api.projects
            .detail(projectId)
            .documents.detail(documentUuid)
            .logs.aggregations(filterOptions)
        : undefined,
  )

  const { data, isLoading, error, mutate } = useSWR<DocumentLogsAggregations>(
    ['documentLogsAggregations', documentUuid, filterOptions, projectId],
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
