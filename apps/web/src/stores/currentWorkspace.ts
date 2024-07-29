import { useCallback } from 'react'

import { SessionWorkspace, useSession, useToast } from '@latitude-data/web-ui'
import { updateWorkspaceAction } from '$/actions/workspaces/update'
import useSWR, { SWRConfiguration } from 'swr'
import { useServerAction } from 'zsa-react'

export default function useCurrentWorkspace(opts?: SWRConfiguration) {
  const key = '/api/workspaces/current'
  const session = useSession()
  const { toast } = useToast()
  const { mutate, data, ...rest } = useSWR<SessionWorkspace>(
    key,
    async (_) => session.workspace,
    {
      ...opts,
      fallbackData: session.workspace,
    },
  )

  const { execute } = useServerAction(updateWorkspaceAction)
  const update = useCallback(
    async (payload: { name: string }) => {
      const [workspace, error] = await execute({
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
    [mutate],
  )

  return { data: data!, update, ...rest }
}
