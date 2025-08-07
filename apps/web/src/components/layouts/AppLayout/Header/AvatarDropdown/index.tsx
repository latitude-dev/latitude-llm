import { useCallback } from 'react'

import { logoutAction } from '$/actions/user/logoutAction'
import { Avatar } from '@latitude-data/web-ui/atoms/Avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  MenuOption,
} from '@latitude-data/web-ui/atoms/DropdownMenu'
import { getUserInfoFromSession } from '@latitude-data/web-ui/getUserInfoFromSession'
import { SessionUser } from '@latitude-data/web-ui/providers'

export default function AvatarDropdown({
  currentUser,
}: {
  currentUser: SessionUser | undefined
}) {
  const onClickLogout = useCallback(async () => {
    await logoutAction()
  }, [])

  const info = currentUser ? getUserInfoFromSession(currentUser) : null
  if (!info) return null

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
