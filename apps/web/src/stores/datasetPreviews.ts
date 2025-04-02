import type { Dataset } from '@latitude-data/core/browser'
import { CsvParsedData } from '@latitude-data/core/lib/readCsv/index'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { SWRConfiguration } from 'swr'
import useSWRImmutable from 'swr/immutable'

const EMPTY_PREVIEW = { headers: [], rows: [], rowCount: 0 }
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
  const fetcher = useFetcher<CsvParsedData>(
    dataset ? ROUTES.api.datasets.detail(dataset.id).preview.root : undefined,
    {
      fallback: EMPTY_PREVIEW,
    },
  )

  const { data = EMPTY_PREVIEW, ...rest } = useSWRImmutable<CsvParsedData>(
    ['datasets_preview', dataset?.id],
    fetcher,
    {
      ...opts,
      onSuccess,
    },
  )

  return {
    data: data as CsvParsedData,
    isLoading: rest.isLoading,
  }
}
