import { DatasetV2 } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'

export type WithPositionData = {
  position: number
  page: number
}

export function useDatasetRowWithPosition(
  {
    dataset,
    datasetRowId,
    onFetched,
  }: {
    dataset?: DatasetV2
    datasetRowId?: string | number
    onFetched?: (data: WithPositionData) => void
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    dataset && datasetRowId
      ? ROUTES.api.datasetsRows.withPosition(+datasetRowId).root
      : undefined,
    {
      searchParams: compactObject({
        datasetId: dataset?.id,
      }) as Record<string, string>,
    },
  )
  const { data, isLoading } = useSWR<WithPositionData>(
    ['datasetRowWithPosition', dataset?.id, datasetRowId],
    fetcher,
    {
      ...opts,
      onSuccess: (data) => {
        if (!datasetRowId) return

        onFetched?.(data)
      },
    },
  )

  return {
    data,
    isLoading,
  }
}
