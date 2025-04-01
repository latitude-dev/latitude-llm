import { useCallback } from 'react'

import { Avatar } from '@latitude-data/web-ui/atoms/Avatar'
import { DropdownMenu } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { SessionUser } from '@latitude-data/web-ui/providers'
import { getUserInfoFromSession } from '@latitude-data/web-ui/getUserInfoFromSession'
import { DropdownMenuTrigger } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
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
