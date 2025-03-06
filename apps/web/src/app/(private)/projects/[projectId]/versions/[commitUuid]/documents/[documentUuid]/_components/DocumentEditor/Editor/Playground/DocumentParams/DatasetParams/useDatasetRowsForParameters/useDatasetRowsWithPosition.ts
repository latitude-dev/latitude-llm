import useSWR, { SWRConfiguration } from 'swr'
import { DatasetV2 } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
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
    enabled = true,
  }: {
    dataset?: DatasetV2
    enabled?: boolean
    datasetRowId?: string | number
    onFetched?: (data: WithPositionData) => void
  },
  opts?: SWRConfiguration,
) {
  const isEnabled = enabled && dataset && datasetRowId
  const fetcher = useFetcher(
    isEnabled
      ? ROUTES.api.datasetsRows.withPosition(+datasetRowId).root
      : undefined,
    {
      searchParams: compactObject({
        datasetId: dataset?.id,
      }) as Record<string, string>,
    },
  )
  const { data, isLoading } = useSWR<WithPositionData>(
    isEnabled
      ? ['datasetRowWithPosition', dataset?.id, datasetRowId]
      : undefined,
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
