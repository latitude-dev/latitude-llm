import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { DocumentLogFilterOptions } from '@latitude-data/core/constants'
import { DocumentLogsAggregations } from '@latitude-data/core/schema/models/types/DocumentLog'

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
