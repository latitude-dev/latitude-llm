'use client'

import { useState } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { OnboardingLayout } from './OnboardingLayout'
import { AIUsageStage } from '@latitude-data/constants/users'
import { cn } from '@latitude-data/web-ui/utils'
import { useHover } from '@latitude-data/web-ui/browser'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { updateAIUsageStageAction } from '$/actions/user/updateAIUsageStage'

type Props = {
  onContinue: () => void
}

type AIUsageOption = {
  value: AIUsageStage
  label: string
  icon: IconName
}

const AI_USAGE_OPTIONS: AIUsageOption[] = [
  { value: AIUsageStage.NotInProduction, label: 'Not in production yet', icon: 'circleDashed' },
  { value: AIUsageStage.InternalToolOnly, label: 'Internal tool only', icon: 'lock' },
  { value: AIUsageStage.LiveWithCustomers, label: 'Live with customers', icon: 'users' },
  { value: AIUsageStage.CorePartOfProduct, label: 'Core part of the product', icon: 'zap' },
]

function OptionCard({
  option,
  isSelected,
  onClick,
}: {
  option: AIUsageOption
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
        'w-full flex flex-row items-center gap-4 p-4 rounded-2xl text-left',
        'border-2 transition-all cursor-pointer',
        isActive ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0',
          isActive ? 'bg-primary' : 'bg-muted',
        )}
      >
        <Icon
          name={option.icon}
          size='normal'
          color={isActive ? 'white' : 'foregroundMuted'}
        />
      </div>
      <Text.H4M color={isActive ? 'accentForeground' : 'foreground'}>
        {option.label}
      </Text.H4M>
    </button>
  )
}

export function Step0b_AIUsage({ onContinue }: Props) {
  const [selectedOption, setSelectedOption] = useState<AIUsageStage | null>(null)
  const { execute } = useLatitudeAction(updateAIUsageStageAction, {
    onSuccess: () => {
      onContinue()
    },
  })

  const handleSelectOption = (option: AIUsageStage) => {
    setSelectedOption(option)
    execute({ aiUsageStage: option })
  }

  return (
    <OnboardingLayout hideHeader>
      <div className='flex flex-col items-center gap-8 w-full'>
        <Icon name='logo' size='xxxlarge' />

        <div className='flex flex-col items-center gap-2'>
          <Text.H2M color='foreground' centered>Where is AI used in your product today?</Text.H2M>
          <Text.H5 color='foregroundMuted' centered>
            This helps us understand your current stage
          </Text.H5>
        </div>

        <div className='flex flex-col gap-3 w-full max-w-md'>
          {AI_USAGE_OPTIONS.map((option) => (
            <OptionCard
              key={option.value}
              option={option}
              isSelected={selectedOption === option.value}
              onClick={() => handleSelectOption(option.value)}
            />
          ))}
        </div>
      </div>
    </OnboardingLayout>
  )
}

