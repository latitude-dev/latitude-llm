import { logoutAction } from '$/actions/user/logoutAction'
import { ROUTES } from '$/services/routes'
import { User } from '@latitude-data/core/browser'
import { Avatar } from '@latitude-data/web-ui/atoms/Avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  MenuOption,
} from '@latitude-data/web-ui/atoms/DropdownMenu'
import { getUserInfoFromSession } from '@latitude-data/web-ui/getUserInfoFromSession'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export default function AvatarDropdown({
  currentUser,
  isCloud,
}: {
  currentUser: User | undefined
  isCloud: boolean
}) {
  const router = useRouter()
  const onClickBackoffice = useCallback(() => {
    router.push(ROUTES.backoffice.root)
  }, [router])

  const onClickLogout = useCallback(async () => {
    await logoutAction()
  }, [])

  let options = useMemo(
    () =>
      [
        ...(currentUser?.email
          ? [
              {
                label: currentUser.email,
              },
            ]
          : []),
        ...(currentUser?.admin && isCloud
          ? [
              {
                label: 'Backoffice',
                iconProps: {
                  name: 'terminal',
                },
                onClick: onClickBackoffice,
              },
            ]
          : []),
        {
          label: 'Logout',
          type: 'destructive',
          onClick: onClickLogout,
        },
      ] as MenuOption[],
    [currentUser, isCloud, onClickBackoffice, onClickLogout],
  )

  const info = currentUser ? getUserInfoFromSession(currentUser) : null
  if (!info) return null

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
