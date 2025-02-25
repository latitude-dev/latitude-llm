import type { DatasetV2 } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui'
import { createDatasetAction } from '$/actions/datasetsV2/create'
import { destroyDatasetAction } from '$/actions/datasetsV2/destroy'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useDatasets(
  {
    onCreateSuccess,
    onFetched,
  }: {
    onCreateSuccess?: (dataset: DatasetV2) => void
    onFetched?: (datasets: DatasetV2[]) => void
  } = {},
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher(ROUTES.api.datasetsV2.root, {
    serializer: (rows) => rows.map(deserialize),
  })
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<DatasetV2[]>(['datasetsV2'], fetcher, {
    ...opts,
    onSuccess: (data) => {
      onFetched?.(data)
    },
  })
  const {
    isPending: isCreating,
    error: createError,
    executeFormAction: createFormAction,
  } = useLatitudeAction<typeof createDatasetAction>(createDatasetAction, {
    onSuccess: ({ data: dataset }) => {
      toast({
        title: 'Success',
        description: 'Dataset uploaded successfully! 🎉',
      })

      mutate([...data, dataset])
      onCreateSuccess?.(dataset)
    },
  })

  const { execute: destroy, isPending: isDestroying } = useLatitudeAction<
    typeof destroyDatasetAction
  >(destroyDatasetAction, {
    onSuccess: ({ data: dataset }) => {
      toast({
        title: 'Success',
        description: 'Dataset removed successfully',
      })

      mutate(data.filter((ds) => ds.id === dataset.id))
    },
  })

  return {
    data,
    mutate,
    isCreating,
    createFormAction,
    createError,
    destroy,
    isDestroying,
    ...rest,
  }
}

function deserialize(item: DatasetV2) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
