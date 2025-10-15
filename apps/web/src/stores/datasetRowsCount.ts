import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

export default function useDatasetRowsCount(
  {
    dataset: selectedDataset,
    onFetched,
  }: {
    dataset?: Dataset | null
    onFetched?: (count: number) => void
  },
  opts?: SWRConfiguration,
) {
  const dataset =
    selectedDataset && 'columns' in selectedDataset
      ? selectedDataset
      : undefined
  const fetcher = useFetcher<number>(
    dataset ? ROUTES.api.datasetsRows.count : undefined,
    {
      searchParams: compactObject({
        datasetId: dataset?.id,
      }) as Record<string, string>,
    },
  )
  const { data, ...rest } = useSWR<number>(
    ['datasetRowsCount', dataset?.id],
    fetcher,
    {
      ...opts,
      onSuccess: (data) => {
        onFetched?.(data)
      },
    },
  )

  return {
    data,
    ...rest,
  }
}
