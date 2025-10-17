import useFetcher from '$/hooks/useFetcher'
import useSWR, { SWRConfiguration } from 'swr'
import { ROUTES } from '$/services/routes'
import { deserializeDataset } from './datasets'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

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
