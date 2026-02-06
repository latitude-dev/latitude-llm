import { useCallback } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { switchWorkspaceAction } from '$/actions/workspaces/switch'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR from 'swr'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

import useLatitudeAction from '$/hooks/useLatitudeAction'

export default function useAvailableWorkspaces() {
  const { toast } = useToast()
  const fetcher = useFetcher<Workspace[]>(ROUTES.api.workspaces.available)

  const { data, ...rest } = useSWR<Workspace[], Error>(
    'api/workspaces/available',
    fetcher,
  )

  const { execute: switchWorkspace, isPending: isSwitching } =
    useLatitudeAction(switchWorkspaceAction)

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

      window.location.href = ROUTES.root
    },
    [switchWorkspace, toast],
  )

  return {
    data,
    switchToWorkspace,
    isSwitching,
    ...rest,
  }
}
