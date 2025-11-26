'use client'

import { ROUTES } from '$/services/routes'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useOnce } from '$/hooks/useMount'
import { switchWorkspaceAction } from '$/actions/workspaces/switch'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

/**
 * We do this here because next.js page can't change server cookies on the fly
 * so we need to have a client component that calls the action to switch workspace
 * and then redirect to the notifications page.
 */
export function WorkspaceSwitcherRedirect({
  targetWorkspaceId,
}: {
  targetWorkspaceId: number
}) {
  const { toast } = useToast()
  const { execute: switchWorkspace, isPending: isSwitching } =
    useLatitudeAction(switchWorkspaceAction)

  useOnce(() => {
    async function performSwitch() {
      const [, error] = await switchWorkspace({
        workspaceId: targetWorkspaceId,
        redirectTo: ROUTES.dashboard.notifications.root,
      })

      if (error) {
        toast({
          title: 'Failed to switch workspace',
          description: error.message,
          variant: 'destructive',
        })

        return
      }
    }

    performSwitch()
  })

  return (
    <div className='flex items-center justify-center min-h-screen'>
      <div className='flex flex-col items-center gap-4'>
        <Text.H4>
          {isSwitching
            ? 'Switching workspace...'
            : 'Redirecting to notifications...'}
        </Text.H4>
      </div>
    </div>
  )
}
