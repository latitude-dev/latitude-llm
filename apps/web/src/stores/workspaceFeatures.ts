import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { toggleWorkspaceFeatureAction } from '$/actions/admin/workspaceFeatures/toggle'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'
import { useMemo } from 'react'

type FeatureWithStatus = {
  id: number
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  enabled: boolean
}

export default function useWorkspaceFeatures(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/workspaceFeatures'
  const fetcher = useFetcher<FeatureWithStatus[]>(
    ROUTES.api.workspaceFeatures.root,
  )
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<FeatureWithStatus[]>(key, fetcher, opts)

  const { execute: toggle, isPending: isToggling } = useLatitudeAction(
    toggleWorkspaceFeatureAction,
    {
      onSuccess: async ({ data: workspaceFeature }) => {
        toast({
          title: 'Success',
          description: `Feature toggled successfully`,
        })
        // Update the feature in the list
        mutate(
          data.map((feature) =>
            feature.id === workspaceFeature.featureId
              ? { ...feature, enabled: workspaceFeature.enabled }
              : feature,
          ),
        )
      },
    },
  )

  return useMemo(
    () => ({
      data,
      toggle,
      isToggling,
      mutate,
      ...rest,
    }),
    [data, toggle, isToggling, mutate, rest],
  )
}
