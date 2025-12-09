import { useCallback, useState } from 'react'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { toggleBigAccountAction } from '$/actions/admin/workspaces/toggleBigAccount'

export function ToggleBigAccountButton({ workspaceId, isBigAccount }: {
  workspaceId: number
  isBigAccount: boolean
}) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(isBigAccount)
  const { execute, isPending } = useLatitudeAction(toggleBigAccountAction, {
    onSuccess: ({ data }) => {
      setEnabled(data.isBigAccount)
      toast({
        title: 'Success',
        description: `Big account flag ${data.isBigAccount ? 'enabled' : 'disabled'} for this workspace`,
      })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setEnabled(enabled)
      await execute({ workspaceId, enabled })
    },
    [execute, workspaceId],
  )

  return (
    <div className='flex flex-col gap-2'>
      <SwitchInput
        checked={enabled}
        label='Big Account'
        description='Restrict data analytics for workspaces with large amounts of data. This is a temporary measure while we scale the platform.'
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </div>
  )
}
