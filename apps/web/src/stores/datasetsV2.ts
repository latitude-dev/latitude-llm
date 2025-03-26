import type { DatasetV2 } from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import { useToast } from '@latitude-data/web-ui'
import { createDatasetAction } from '$/actions/datasetsV2/create'
import { destroyDatasetAction } from '$/actions/datasetsV2/destroy'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { toggleDatasetAction } from '$/actions/datasetsV2/toggleGoldenDatasetAction'

const EMPTY_ARRAY: DatasetV2[] = []
export default function useDatasets(
  {
    onCreateSuccess,
    onFetched,
    page,
    pageSize,
    enabled = true,
  }: {
    onCreateSuccess?: (dataset: DatasetV2) => void
    onFetched?: (datasets: DatasetV2[]) => void
    page?: string | null | undefined
    pageSize?: string | null
    enabled?: boolean
  } = {},
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher(enabled ? ROUTES.api.datasetsV2.root : undefined, {
    serializer: (rows) => rows.map(deserialize),
    searchParams: compactObject({
      page: page ? String(page) : undefined,
      pageSize: pageSize ? String(pageSize) : undefined,
    }) as Record<string, string>,
  })
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<DatasetV2[]>(
    enabled ? compact(['datasetsV2', page, pageSize]) : undefined,
    fetcher,
    {
      ...opts,
      onSuccess: (data) => {
        onFetched?.(data)
      },
    },
  )
  const {
    isPending: isCreating,
    error: createError,
    executeFormAction: createFormAction,
  } = useLatitudeAction<typeof createDatasetAction>(createDatasetAction, {
    onSuccess: ({ data: dataset }) => {
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

      mutate(data.filter((ds) => ds.id !== dataset.id))
    },
  })

  const { execute: toggleIsGolden, isPending: isUpdatingGolden } =
    useLatitudeAction<typeof toggleDatasetAction>(toggleDatasetAction, {
      onSuccess: ({ data: dataset }) => {
        if (!dataset) return

        if (dataset.isGolden) {
          toast({
            title: 'Success',
            description: 'Dataset converted to golden successfully',
          })
        }

        const newData = data.map((prevDataset) =>
          prevDataset.id === dataset.id ? deserialize(dataset) : prevDataset,
        )
        mutate(newData)
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
    toggleIsGolden,
    isUpdatingGolden,
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
