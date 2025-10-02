import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'
import { type Dataset } from '@latitude-data/core/schema/types'

export default function useDatasetRowCount(
  {
    dataset,
  }: {
    dataset: Dataset
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.datasetsRows.count
  const fetcher = useFetcher<number>(route, {
    searchParams: compactObject({
      datasetId: dataset.id,
    }) as Record<string, string>,
  })

  const { data = 0, ...rest } = useSWR<number>(
    compact(['datasetRowCount', dataset.id]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
