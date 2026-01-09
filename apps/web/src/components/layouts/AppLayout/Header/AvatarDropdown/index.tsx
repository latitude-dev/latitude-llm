import { logoutAction } from '$/actions/user/logoutAction'
import { ROUTES } from '$/services/routes'
import { Avatar } from '@latitude-data/web-ui/atoms/Avatar'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TripleThemeToggle } from '@latitude-data/web-ui/molecules/TrippleThemeToggle'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { User } from '@latitude-data/core/schema/models/types/User'
import { getUserInfoFromSession } from '$/lib/getUserInfo'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

type DropdownItemProps = {
  label: string
  icon?: IconName
  color?: TextColor
  onClick?: () => void
}

function DropdownItem({
  label,
  icon,
  color = 'foreground',
  onClick,
}: DropdownItemProps) {
  return (
    <div
      className={cn('w-full flex items-center gap-x-2 px-2 py-1 rounded-md', {
        'cursor-pointer hover:bg-muted': !!onClick,
      })}
      onClick={onClick}
    >
      {icon && <Icon name={icon} color={color} />}
      <Text.H5 color={color}>{label}</Text.H5>
    </div>
  )
}

export default function AvatarDropdown({
  currentUser,
  isCloud,
}: {
  currentUser: User | undefined
  isCloud: boolean
}) {
  const router = useRouter()
  const { setValue: setReplayOnboarding } = useLocalStorage<boolean>({
    key: AppLocalStorage.replayOnboarding,
    defaultValue: false,
  })
  const { setValue: setOnboardingState } = useLocalStorage({
    key: AppLocalStorage.onboardingState,
    defaultValue: null,
  })

  const onClickBackoffice = useCallback(() => {
    router.push(ROUTES.backoffice.root)
  }, [router])

  const onClickNotifications = useCallback(() => {
    router.push(ROUTES.notifications.root)
  }, [router])

  const onClickReplayOnboarding = useCallback(() => {
    setOnboardingState(null)
    setReplayOnboarding(true)
    router.push(ROUTES.onboarding.root)
  }, [setOnboardingState, setReplayOnboarding, router])

  const onClickLogout = useCallback(async () => {
    await logoutAction()
  }, [])

  const options = useMemo(
    () =>
      [
        currentUser?.email && {
          label: currentUser.email,
        },
        {
          label: 'Notifications',
          icon: 'bell',
          onClick: onClickNotifications,
        },
        isCloud && {
          label: 'Replay Onboarding',
          icon: 'graduationCap',
          onClick: onClickReplayOnboarding,
        },
        currentUser?.admin &&
          isCloud && {
            label: 'Backoffice',
            icon: 'terminal',
            onClick: onClickBackoffice,
          },
        {
          label: 'Logout',
          icon: 'logOut',
          color: 'destructive',
          onClick: onClickLogout,
        },
      ].filter(Boolean) as DropdownItemProps[],
    [
      currentUser,
      isCloud,
      onClickBackoffice,
      onClickNotifications,
      onClickReplayOnboarding,
      onClickLogout,
    ],
  )

  const info = currentUser ? getUserInfoFromSession(currentUser) : null
  if (!info) return null

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant='ghost'>
          <Avatar
            alt={info.name}
            fallback={info.fallback}
            className='w-6 h-6'
          />
        </Button>
      </Popover.Trigger>
      <Popover.Content
        side='bottom'
        align='end'
        size='large'
        className='flex flex-col gap-4 min-w-52 px-1 py-2'
      >
        <div className='flex flex-col gap-0'>
          {options.map((option) => (
            <DropdownItem key={option.label} {...option} />
          ))}
        </div>

        <div className='flex flex-row items-center justify-start px-2'>
          <TripleThemeToggle direction='horizontal' />
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
