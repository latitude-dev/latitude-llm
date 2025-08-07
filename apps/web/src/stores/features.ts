import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { createFeatureAction } from '$/actions/admin/features/create'
import { destroyFeatureAction } from '$/actions/admin/features/destroy'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { type SWRConfiguration } from 'swr'
import { useMemo } from 'react'

type Feature = {
  id: number
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

export default function useFeatures(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/features'
  const fetcher = useFetcher<Feature[]>(ROUTES.api.admin.features.root)
  const { data = [], mutate, isLoading } = useSWR<Feature[]>(key, fetcher, opts)

  const { execute: create, isPending: isCreating } = useLatitudeAction(createFeatureAction, {
    onSuccess: async ({ data: feature }) => {
      toast({
        title: 'Success',
        description: `Feature "${feature.name}" created successfully`,
      })
      mutate([...data, feature])
    },
  })

  const { execute: destroy, isPending: isDestroying } = useLatitudeAction(destroyFeatureAction, {
    onSuccess: async ({ data: feature }) => {
      toast({
        title: 'Success',
        description: `Feature "${feature.name}" deleted successfully`,
      })
      mutate(data.filter((item) => item.id !== feature.id))
    },
  })

  return useMemo(
    () => ({
      data,
      create,
      isCreating,
      destroy,
      isDestroying,
      mutate,
      isLoading,
    }),
    [data, create, isCreating, destroy, isDestroying, mutate, isLoading],
  )
}
