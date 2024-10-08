import type { Dataset } from '@latitude-data/core/browser'
import { CsvParsedData } from '@latitude-data/core/lib/readCsv'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { SWRConfiguration } from 'swr'
import useSWRImmutable from 'swr/immutable'

export default function useDatasetPreview(
  { dataset }: { dataset: Dataset },
  opts?: SWRConfiguration,
) {
  const { data: workspace } = useCurrentWorkspace()
  const fetcher = useFetcher(
    ROUTES.api.datasets.detail(dataset.id).preview.root,
    {
      fallback: { headers: [], rows: [], rowCount: 0 },
    },
  )

  const { data = [], ...rest } = useSWRImmutable(
    ['workspace', workspace.id, 'datasets_preview', dataset?.id],
    fetcher,
    opts,
  )

  return {
    data: data as CsvParsedData,
    isLoading: rest.isLoading,
  }
}
