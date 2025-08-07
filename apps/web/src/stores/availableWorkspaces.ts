import { useCallback } from 'react'

import type { Workspace } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { switchWorkspaceAction } from '$/actions/workspaces/switch'
import useFetcher from '$/hooks/useFetcher'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import { ROUTES } from '$/services/routes'
import useSWR from 'swr'
import { useServerAction } from 'zsa-react'
import { useNavigate } from '$/hooks/useNavigate'

export default function useAvailableWorkspaces() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const fetcher = useFetcher<Workspace[]>(ROUTES.api.workspaces.available)

  const { mutate: refreshCurrentWorkspace } = useCurrentWorkspace()
  const { data, ...rest } = useSWR<Workspace[], Error>('api/workspaces/available', fetcher)

  const { execute: switchWorkspace, isPending: isSwitching } =
    useServerAction(switchWorkspaceAction)

  const switchToWorkspace = useCallback(
    async (workspaceId: number) => {
      const [, error] = await switchWorkspace({
        workspaceId,
      })

      if (error) {
        toast({
          title: 'Failed to switch workspace',
          description: error.message,
          variant: 'destructive',
        })

        return
      }

      navigate.push(ROUTES.root)
      refreshCurrentWorkspace()
    },
    [switchWorkspace, toast, refreshCurrentWorkspace, navigate],
  )

  return {
    data,
    switchToWorkspace,
    isSwitching,
    ...rest,
  }
}
