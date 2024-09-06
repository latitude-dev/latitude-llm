import { useCallback } from 'react'

import type { Dataset } from '@latitude-data/core/browser'
import { CsvParsedData } from '@latitude-data/core/lib/readCsv'
import { useToast } from '@latitude-data/web-ui'
import { previewDatasetAction } from '$/actions/datasets/preview'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { SWRConfiguration } from 'swr'
import useSWRImmutable from 'swr/immutable'

export default function useDatasetPreview(
  { dataset }: { dataset: Dataset },
  opts?: SWRConfiguration,
) {
  const { data: workspace } = useCurrentWorkspace()
  const { toast } = useToast()
  const fetcher = useCallback(async () => {
    const [data, error] = await previewDatasetAction({ id: dataset.id })
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })

      return { headers: [], rows: [], rowCount: 0 }
    }

    return data
  }, [toast])

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
