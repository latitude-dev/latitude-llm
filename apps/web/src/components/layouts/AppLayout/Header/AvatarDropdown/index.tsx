import { useCallback } from 'react'

import {
  Avatar,
  DropdownMenu,
  DropdownMenuTrigger,
  getUserInfoFromSession,
  MenuOption,
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

  let options: MenuOption[] = [
    {
      label: 'Logout',
      type: 'destructive',
      onClick: onClickLogout,
    },
  ]
  options = currentUser
    ? [
        {
          label: currentUser?.email,
          onClick: () => {},
        },
        ...options,
      ]
    : options

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
      options={options}
      side='bottom'
      align='end'
    />
  )
}
