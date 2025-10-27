import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { TracesAggregations } from '@latitude-data/core/schema/models/types/Span'

export default function useDocumentTracesAggregations(
  {
    documentUuid,
    commitUuid,
    projectId,
    disable,
  }: {
    documentUuid?: string
    commitUuid?: string
    projectId: number
    disable?: boolean
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<TracesAggregations>(
    disable || !documentUuid || !commitUuid
      ? undefined
      : ROUTES.api.projects
          .detail(projectId)
          .commits.detail(commitUuid)
          .documents.detail(documentUuid).traces.aggregations,
  )

  const { data, isLoading, error, mutate } = useSWR<TracesAggregations>(
    ['documentTracesAggregations', documentUuid, commitUuid, projectId],
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
