import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { toggleFeatureForWorkspacesAction } from '$/actions/admin/workspaceFeatures/toggleForWorkspaces'
import useFetcher from '$/hooks/useFetcher'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { API_ROUTES } from '$/services/routes/api'
import useSWR, { SWRConfiguration } from 'swr'
import { useMemo } from 'react'

type FeatureWithWorkspaceCounts = {
  id: number
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  workspaceCount: number
  workspaces: {
    id: number
    name: string
    enabled: boolean
  }[]
}

export default function useAdminFeatures(opts?: SWRConfiguration) {
  const { toast } = useToast()
  const key = 'api/admin/features'
  const fetcher = useFetcher<FeatureWithWorkspaceCounts[]>(
    API_ROUTES.admin.features.root,
  )
  const {
    data = [],
    mutate,
    ...rest
  } = useSWR<FeatureWithWorkspaceCounts[]>(key, fetcher, opts)

  const { execute: toggleForWorkspaces, isPending: isToggling } =
    useLatitudeAction(toggleFeatureForWorkspacesAction, {
      onSuccess: async () => {
        toast({
          title: 'Success',
          description: 'Feature updated for selected workspaces',
        })
        // Refetch the data to get updated workspace counts
        mutate()
      },
    })

  return useMemo(
    () => ({
      data,
      toggleForWorkspaces,
      isToggling,
      mutate,
      ...rest,
    }),
    [data, toggleForWorkspaces, isToggling, mutate, rest],
  )
}
