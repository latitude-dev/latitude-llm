import { useCallback } from 'react'

import {
  Avatar,
  DropdownMenu,
  DropdownMenuTrigger,
  getUserInfoFromSession,
  SessionUser,
} from '@latitude-data/web-ui'
import { logoutAction } from '$/actions/user/logoutAction'

export default function AvatarDropdown({
  currentUser,
}: {
  currentUser: SessionUser | undefined
}) {
  const info = currentUser ? getUserInfoFromSession(currentUser) : null
  if (!info) return null

  const onClickLogout = useCallback(async () => {
    await logoutAction()
  }, [])

  return (
    <DropdownMenu
      trigger={() => (
        <DropdownMenuTrigger>
          <Avatar
            alt={info.name}
            fallback={info.fallback}
            className='w-6 h-6'
          />
        </DropdownMenuTrigger>
      )}
      options={[
        {
          label: 'Logout',
          type: 'destructive',
          onClick: onClickLogout,
        },
      ]}
      side='bottom'
      align='end'
    />
  )
}
