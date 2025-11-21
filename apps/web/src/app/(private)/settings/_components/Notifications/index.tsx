'use client'

import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { updateWeeklyEmailPreferenceAction } from '$/actions/memberships/updateWeeklyEmailPreference'
import { updateEscalatingIssuesEmailPreferenceAction } from '$/actions/memberships/updateEscalatingIssuesEmailPreference'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useCurrentUser } from '$/stores/currentUser'

export default function Notifications() {
  const { data: user, mutate } = useCurrentUser()
  const { toast } = useToast()

  const { execute: updateWeeklyEmail, isPending: isUpdatingWeeklyEmail } =
    useLatitudeAction(updateWeeklyEmailPreferenceAction, {
      onSuccess: async ({ data: updatedMembership }) => {
        toast({
          title: 'Success',
          description: 'Weekly email preference updated successfully',
        })
        mutate({
          ...user!,
          notifications: {
            ...user!.notifications,
            wantToReceiveWeeklyEmail:
              updatedMembership.wantToReceiveWeeklyEmail,
          },
        })
      },
      onError: async (error) => {
        toast({
          title: 'Error',
          description: error?.message,
          variant: 'destructive',
        })
      },
    })

  const {
    execute: updateEscalatingIssuesEmail,
    isPending: isUpdatingEscalatingIssuesEmail,
  } = useLatitudeAction(updateEscalatingIssuesEmailPreferenceAction, {
    onSuccess: async ({ data: updatedMembership }) => {
      toast({
        title: 'Success',
        description: 'Issue email preference updated successfully',
      })
      mutate({
        ...user!,
        notifications: {
          ...user!.notifications,
          wantToReceiveEscalatingIssuesEmail:
            updatedMembership.wantToReceiveEscalatingIssuesEmail,
        },
      })
    },
    onError: async (error) => {
      toast({
        title: 'Error',
        description: error?.message,
        variant: 'destructive',
      })
    },
  })

  if (!user) return null

  return (
    <div className='flex flex-col gap-4'>
      <Text.H4B>Email Notifications</Text.H4B>
      <div className='flex flex-col gap-2'>
        <SwitchInput
          label='Weekly summary email'
          description='Receive a weekly email with a summary of your workspace activity'
          checked={user.notifications?.wantToReceiveWeeklyEmail ?? false}
          disabled={isUpdatingWeeklyEmail}
          onCheckedChange={(checked) => {
            updateWeeklyEmail({ wantToReceive: checked })
          }}
        />
        <SwitchInput
          label='Escalating issue alerts'
          description='Receive email notifications when issues are escalating in your workspace'
          checked={
            user.notifications?.wantToReceiveEscalatingIssuesEmail ?? false
          }
          disabled={isUpdatingEscalatingIssuesEmail}
          onCheckedChange={(checked) => {
            updateEscalatingIssuesEmail({ wantToReceive: checked })
          }}
        />
      </div>
    </div>
  )
}
