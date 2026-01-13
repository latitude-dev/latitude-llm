'use client'

import { useState } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { OnboardingLayout } from './OnboardingLayout'
import { UserTitle } from '@latitude-data/constants/users'
import { cn } from '@latitude-data/web-ui/utils'
import { useHover } from '@latitude-data/web-ui/browser'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { updateUserTitleAction } from '$/actions/user/updateTitle'

type Props = {
  onContinue: () => void
}

type RoleOption = {
  value: UserTitle
  label: string
  icon: IconName
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: UserTitle.Engineer, label: 'Engineer', icon: 'code' },
  { value: UserTitle.DataAIAndML, label: 'Data / AI / ML', icon: 'braces' },
  { value: UserTitle.ProductManager, label: 'Product Manager', icon: 'squareChart' },
  { value: UserTitle.Designer, label: 'Designer', icon: 'brush' },
  { value: UserTitle.Founder, label: 'Founder', icon: 'rocket' },
  { value: UserTitle.Other, label: 'Other', icon: 'userRound' },
]

function RoleCard({
  role,
  isSelected,
  onClick,
}: {
  role: RoleOption
  isSelected: boolean
  onClick: () => void
}) {
  const [ref, isHovered] = useHover<HTMLButtonElement>()
  const isActive = isSelected || isHovered

  return (
    <button
      ref={ref}
      type='button'
      onClick={onClick}
      className={cn(
        'w-full flex flex-col gap-4 p-5 rounded-2xl text-left',
        'border-2 transition-all cursor-pointer',
        isActive ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
          isActive ? 'bg-primary' : 'bg-muted',
        )}
      >
        <Icon
          name={role.icon}
          size='normal'
          color={isActive ? 'white' : 'foregroundMuted'}
        />
      </div>
      <Text.H4M color={isActive ? 'accentForeground' : 'foreground'}>
        {role.label}
      </Text.H4M>
    </button>
  )
}

export function Step0_RoleSelection({ onContinue }: Props) {
  const [selectedRole, setSelectedRole] = useState<UserTitle | null>(null)
  const { execute } = useLatitudeAction(updateUserTitleAction, {
    onSuccess: () => {
      onContinue()
    },
  })

  const handleSelectRole = (role: UserTitle) => {
    setSelectedRole(role)
    execute({ title: role })
  }

  return (
    <OnboardingLayout hideHeader>
      <div className='flex flex-col items-center gap-8 w-full max-w-2xl'>
        <div className='flex flex-col items-center gap-2 text-center'>
          <Text.H2M color='foreground'>What's your role?</Text.H2M>
          <Text.H5 color='foregroundMuted'>
            This helps us personalize your experience
          </Text.H5>
        </div>

        <div className='grid grid-cols-3 gap-4 w-full'>
          {ROLE_OPTIONS.map((role) => (
            <RoleCard
              key={role.value}
              role={role}
              isSelected={selectedRole === role.value}
              onClick={() => handleSelectRole(role.value)}
            />
          ))}
        </div>
      </div>
    </OnboardingLayout>
  )
}
