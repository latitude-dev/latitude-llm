'use client'

import { useCallback, useState } from 'react'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { toggleBigAccountAction } from '$/actions/admin/workspaces/toggleBigAccount'

export function BigAccountBanner({
  workspaceId,
  isBigAccount,
}: {
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
    async (value: boolean) => {
      setEnabled(value)
      await execute({ workspaceId, enabled: value })
    },
    [execute, workspaceId],
  )

  return (
    <div className='flex flex-row items-center justify-between p-4 bg-muted/30 rounded-lg'>
      <div className='flex flex-col gap-1'>
        <Text.H5>Big Account</Text.H5>
        <Text.H6 color='foregroundMuted'>
          Restrict data analytics for workspaces with large amounts of data
        </Text.H6>
      </div>
      <SwitchInput
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </div>
  )
}
