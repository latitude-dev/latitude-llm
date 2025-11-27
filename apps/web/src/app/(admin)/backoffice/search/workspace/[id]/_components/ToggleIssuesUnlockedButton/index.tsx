import { useCallback, useState } from 'react'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { toggleIssuesUnlockedAction } from '$/actions/admin/workspaces/toggleIssuesUnlocked'

type Props = {
  workspaceId: number
  issuesUnlocked: boolean
}

export function ToggleIssuesUnlockedButton({
  workspaceId,
  issuesUnlocked,
}: Props) {
  const { toast } = useToast()
  const [unlocked, setUnlocked] = useState(issuesUnlocked)
  const { execute, isPending } = useLatitudeAction(toggleIssuesUnlockedAction, {
    onSuccess: ({ data }) => {
      setUnlocked(data.issuesUnlocked)
      toast({
        title: 'Success',
        description: `Issues ${data.issuesUnlocked ? 'unlocked' : 'locked'} for this workspace`,
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
      setUnlocked(enabled)
      await execute({ workspaceId, enabled })
    },
    [execute, workspaceId],
  )

  return (
    <div className='flex flex-col gap-2'>
      <SwitchInput
        checked={unlocked}
        label={
          unlocked ? 'Issues Dashboard Unlocked' : 'Issues Dashboard Locked'
        }
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </div>
  )
}
