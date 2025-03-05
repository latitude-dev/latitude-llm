import type { DatasetV2 } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'

export default function useDatasetRowsCount(
  {
    dataset,
    onFetched,
  }: {
    dataset?: DatasetV2
    onFetched?: (count: number) => void
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
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
