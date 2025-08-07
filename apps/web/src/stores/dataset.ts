import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { Dataset } from '@latitude-data/core/browser'
import useSWR, { SWRConfiguration } from 'swr'
import { deserializeDataset } from './datasets'

export function useDataset(id: number, opts?: SWRConfiguration) {
  const fetcher = useFetcher<Dataset, Dataset>(
    ROUTES.api.datasets.detail(id).root,
    {
      serializer: deserializeDataset,
      fallback: undefined,
    },
  )

  return useSWR<Dataset>(['datasetsV2', id], fetcher, opts)
}
