'use client'

import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ToggleBigAccountButton } from '../ToggleBigAccountButton'

export function BigAccountBanner({
  workspaceId,
  isBigAccount,
}: {
  workspaceId: number
  isBigAccount: boolean
}) {
  return (
    <div className='bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6'>
      <div className='flex items-start gap-3'>
        <div className='p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg'>
          <Icon name='database' size='normal' color='primary' />
        </div>
        <div className='flex-1 gap-y-1'>
          <div className='mb-4'>
            <Text.H4 display='block' weight='semibold'>
              Big Account Settings
            </Text.H4>
            <Text.H5 color='foregroundMuted'>
              Enable this checkbox to restrict data analytics on workspaces with
              too many data. This is a temporary measure while we scale the
              platform.
            </Text.H5>
          </div>
          <ToggleBigAccountButton
            workspaceId={workspaceId}
            isBigAccount={isBigAccount}
          />
        </div>
      </div>
    </div>
  )
}
