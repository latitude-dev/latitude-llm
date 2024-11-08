import type { Dataset } from '@latitude-data/core/browser'
import { CsvParsedData } from '@latitude-data/core/lib/readCsv'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { SWRConfiguration } from 'swr'
import useSWRImmutable from 'swr/immutable'

export default function useDatasetPreview(
  {
    dataset,
    onSuccess,
  }: {
    dataset: Dataset | undefined
    onSuccess?: (data: CsvParsedData) => void
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(
    dataset ? ROUTES.api.datasets.detail(dataset.id).preview.root : undefined,
    {
      fallback: { headers: [], rows: [], rowCount: 0 },
    },
  )

  const { data = [], ...rest } = useSWRImmutable<CsvParsedData>(
    ['datasets_preview', dataset?.id],
    fetcher,
    {
      ...opts,
      onSuccess: (data) => {
        onSuccess?.(data)
      },
    },
  )

  return {
    data: data as CsvParsedData,
    isLoading: rest.isLoading,
  }
}
