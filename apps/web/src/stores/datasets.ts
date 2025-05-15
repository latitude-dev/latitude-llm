import type { Dataset } from '@latitude-data/core/browser'
import { compact } from 'lodash-es'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createDatasetAction } from '$/actions/datasets/create'
import { destroyDatasetAction } from '$/actions/datasets/destroy'
import { updateDatasetColumnAction } from '$/actions/datasets/updateColumn'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'

const EMPTY_ARRAY: Dataset[] = []
export default function useDatasets(
  {
    onCreateSuccess,
    onFetched,
    page,
    pageSize,
    enabled = true,
  }: {
    onCreateSuccess?: (dataset: Dataset) => void
    onFetched?: (datasets: Dataset[]) => void
    page?: string | null | undefined
    pageSize?: string | null
    enabled?: boolean
  } = {},
  opts?: SWRConfiguration,
) {
  const { toast } = useToast()
  const fetcher = useFetcher<Dataset[], Dataset[]>(
    enabled ? ROUTES.api.datasets.root : undefined,
    {
      serializer: (rows) => rows.map(deserializeDataset),
      searchParams: compactObject({
        page: page ? String(page) : undefined,
        pageSize: pageSize ? String(pageSize) : undefined,
      }) as Record<string, string>,
    },
  )
  const {
    data = EMPTY_ARRAY,
    mutate,
    ...rest
  } = useSWR<Dataset[]>(
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

      // FIXME: This does not work. WHY?
      mutate(data.filter((ds) => ds.id !== dataset.id))
    },
  })

  const { execute: updateColumn, isPending: isUpdatingColumn } =
    useLatitudeAction<typeof updateDatasetColumnAction>(
      updateDatasetColumnAction,
      {
        onSuccess: ({ data: dataset }) => {
          mutate(data.map((ds) => (ds.id === dataset.id ? dataset : ds)))
        },
      },
    )

  return {
    data,
    mutate,
    isCreating,
    createFormAction,
    createError,
    destroy,
    isDestroying,
    updateColumn,
    isUpdatingColumn,
    ...rest,
  }
}

export function deserializeDataset(item: Dataset) {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}
