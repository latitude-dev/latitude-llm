'use client'

import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCurrentUser } from '$/stores/currentUser'

export default function Notifications() {
  const {
    data: user,
    updateWeeklyEmail,
    isUpdatingWeeklyEmail,
    updateEscalatingIssuesEmail,
    isUpdatingEscalatingIssuesEmail,
    isLoading: isLoadingUser,
  } = useCurrentUser()

  if (!user && !isLoadingUser) return null

  return (
    <div className='flex flex-col gap-4'>
      <Text.H4B>Email Notifications</Text.H4B>
      <div className='flex flex-col gap-2'>
        {isLoadingUser ? (
          <div>Loading settings...</div>
        ) : user ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  )
}
