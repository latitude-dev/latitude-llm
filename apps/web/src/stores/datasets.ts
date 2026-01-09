import { compact } from 'lodash-es'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { destroyDatasetAction } from '$/actions/datasets/destroy'
import { updateDatasetColumnAction } from '$/actions/datasets/updateColumn'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useCallback, useState } from 'react'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'
import { generateDatasetAction } from '$/actions/datasets/generateDataset'

const EMPTY_ARRAY: Dataset[] = []

type CreateDatasetResponse = {
  success: boolean
  dataset?: Dataset
  errors?: Record<string, string[]>
  error?: string
}

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
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<{
    fieldErrors?: Record<string, string[]>
  } | null>(null)

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

  const createDataset = useCallback(
    async (formData: FormData) => {
      setIsCreating(true)
      setCreateError(null)

      try {
        const response = await fetch('/api/datasets/create', {
          method: 'POST',
          body: formData,
        })

        const result: CreateDatasetResponse = await response.json()

        if (!result.success) {
          if (result.errors) {
            setCreateError({ fieldErrors: result.errors })
          } else {
            toast({
              title: 'Error',
              description: result.error || 'Failed to create dataset',
              variant: 'destructive',
            })
          }
          return
        }

        if (result.dataset) {
          mutate([...data, result.dataset])
          onCreateSuccess?.(result.dataset)
          toast({
            title: 'Success',
            description: 'Dataset created successfully! 🎉',
          })
        }
      } catch (error) {
        toast({
          title: 'Error',
          description:
            error instanceof Error ? error.message : 'Failed to create dataset',
          variant: 'destructive',
        })
      } finally {
        setIsCreating(false)
      }
    },
    [data, mutate, onCreateSuccess, toast],
  )

  const { execute: destroy, isPending: isDestroying } = useLatitudeAction(
    destroyDatasetAction,
    {
      onSuccess: ({ data: dataset }) => {
        toast({
          title: 'Success',
          description: 'Dataset removed successfully',
        })

        // FIXME: This does not work. WHY?
        mutate(data.filter((ds) => ds.id !== dataset.id))
      },
    },
  )

  const { execute: updateColumn, isPending: isUpdatingColumn } =
    useLatitudeAction(updateDatasetColumnAction, {
      onSuccess: ({ data: dataset }) => {
        mutate(data.map((ds) => (ds.id === dataset.id ? dataset : ds)))
      },
    })

  const {
    execute: runGenerateAction,
    isPending: generateIsLoading,
    error: generateError,
  } = useLatitudeAction(generateDatasetAction, {
    onError: (error) => {
      toast({
        title: 'Failed to generate dataset',
        description: error.message,
        variant: 'destructive',
      })
    },
    onSuccess: ({ data: dataset }) => {
      mutate([...data, dataset])
    },
  })

  return {
    data,
    mutate,
    isCreating,
    createDataset,
    createError,
    destroy,
    isDestroying,
    updateColumn,
    isUpdatingColumn,
    runGenerateAction,
    generateIsLoading,
    generateError,
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
