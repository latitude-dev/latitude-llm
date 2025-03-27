import { useCallback } from 'react'

import { Workspace } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { setDefaultProviderAction } from '$/actions/workspaces/setDefaultProvider'
import { updateWorkspaceAction } from '$/actions/workspaces/update'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR from 'swr'
import { useServerAction } from 'zsa-react'

export default function useCurrentWorkspace() {
  const { toast } = useToast()
  const fetcher = useFetcher<Workspace>(ROUTES.api.workspaces.current)

  const { mutate, data, ...rest } = useSWR<Workspace, Error>(
    'api/workspaces/current',
    fetcher,
  )

  const { execute: updateWorkspace } = useServerAction(updateWorkspaceAction)
  const updateName = useCallback(
    async (payload: { name: string }) => {
      if (!data) return

      const [workspace, error] = await updateWorkspace({
        workspaceId: data!.id,
        name: payload.name,
      })
      if (error) {
        toast({
          title: 'Failed to update workspace name',
          description: error.message,
          variant: 'destructive',
        })

        return
      }

      toast({
        title: 'Name updated to ' + payload.name,
      })

      mutate(workspace)
      return workspace
    },
    [mutate, data],
  )

  const { execute: setDefaultProvider } = useServerAction(
    setDefaultProviderAction,
  )
  const updateDefaultProvider = useCallback(
    async (payload: { defaultProviderId: number | null }) => {
      if (!data) return

      const [workspace, error] = await setDefaultProvider({
        workspaceId: data!.id,
        defaultProviderId: payload.defaultProviderId,
      })
      if (error) {
        toast({
          title: 'Failed to update workspace default provider',
          description: error.message,
          variant: 'destructive',
        })

        return
      }

      toast({
        title: 'Default provider updated',
      })

      mutate(workspace)
      return workspace
    },
    [mutate, data],
  )

  return { data, updateName, updateDefaultProvider, ...rest }
}
