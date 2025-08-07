import { setDefaultProviderAction } from '$/actions/workspaces/setDefaultProvider'
import { updateWorkspaceAction } from '$/actions/workspaces/update'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import type { Workspace } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { compact } from 'lodash-es'
import { useCallback, useMemo } from 'react'
import useSWR, { type SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

export default function useCurrentWorkspace(opts?: SWRConfiguration) {
  const { toast } = useToast()

  const route = ROUTES.api.workspaces.current
  const fetcher = useFetcher<Workspace>(route, { fallback: null })

  const { data = undefined, mutate, isLoading } = useSWR<Workspace>(compact(route), fetcher, opts)

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
        title: `Name updated to ${payload.name}`,
      })

      mutate(workspace)

      return workspace
    },
    [mutate, data, toast, updateWorkspace],
  )

  const { execute: setDefaultProvider } = useServerAction(setDefaultProviderAction)
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
    [mutate, data, setDefaultProvider, toast],
  )

  return useMemo(
    () => ({
      data,
      updateName,
      updateDefaultProvider,
      mutate,
      isLoading,
    }),
    [data, updateName, updateDefaultProvider, mutate, isLoading],
  )
}
