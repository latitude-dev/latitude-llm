'use client'

import { useState } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { OnboardingLayout } from './OnboardingLayout'
import { LatitudeGoal } from '@latitude-data/constants/users'
import { cn } from '@latitude-data/web-ui/utils'
import { useHover } from '@latitude-data/web-ui/browser'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { updateLatitudeGoalAction } from '$/actions/user/updateLatitudeGoal'

type Props = {
  onContinue: () => void
}

type GoalOption = {
  value: LatitudeGoal
  label: string
  icon: IconName
}

const GOAL_OPTIONS: GoalOption[] = [
  { value: LatitudeGoal.ObservingTraces, label: 'Observing production traces', icon: 'eye' },
  { value: LatitudeGoal.SettingUpEvaluations, label: 'Setting up evaluations', icon: 'listCheck' },
  { value: LatitudeGoal.ManagingPromptVersions, label: 'Managing prompt versions', icon: 'history' },
  { value: LatitudeGoal.ImprovingAccuracy, label: 'Improving accuracy / reliability', icon: 'circleCheck' },
  { value: LatitudeGoal.ImprovingLatency, label: 'Scaling (latency / cost)', icon: 'zap' },
  { value: LatitudeGoal.JustExploring, label: 'Just exploring', icon: 'search' },
  { value: LatitudeGoal.Other, label: 'Other', icon: 'ellipsis' },
]

function OptionCard({
  option,
  isSelected,
  onClick,
}: {
  option: GoalOption
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

export function Step0c_LatitudeGoals({ onContinue }: Props) {
  const [selectedOption, setSelectedOption] = useState<LatitudeGoal | null>(null)
  const [otherText, setOtherText] = useState('')
  const { execute, isPending } = useLatitudeAction(updateLatitudeGoalAction, {
    onSuccess: () => {
      onContinue()
    },
  })

  const handleSelectOption = (option: LatitudeGoal) => {
    setSelectedOption(option)
    if (option !== LatitudeGoal.Other) {
      execute({ latitudeGoal: option })
    }
  }

  const handleSubmitOther = () => {
    if (selectedOption === LatitudeGoal.Other && otherText.trim()) {
      execute({ latitudeGoal: LatitudeGoal.Other, latitudeGoalOther: otherText.trim() })
    }
  }

  return (
    <OnboardingLayout hideHeader>
      <div className='flex flex-col items-center gap-8 w-full'>
        <Icon name='logo' size='xxxlarge' />

        <div className='flex flex-col items-center gap-2'>
          <Text.H2M color='foreground' centered>What do you want to use Latitude for?</Text.H2M>
          <Text.H5 color='foregroundMuted' centered>
            This helps us tailor your experience
          </Text.H5>
        </div>

        <div className='flex flex-col gap-3 w-full max-w-md'>
          {GOAL_OPTIONS.map((option) => (
            <OptionCard
              key={option.value}
              option={option}
              isSelected={selectedOption === option.value}
              onClick={() => handleSelectOption(option.value)}
            />
          ))}

          {selectedOption === LatitudeGoal.Other && (
            <div className='flex flex-col gap-4 w-full'>
              <Input
                placeholder='Tell us what you want to achieve...'
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                autoFocus
              />
              <Button
                variant='default'
                fancy
                onClick={handleSubmitOther}
                disabled={!otherText.trim()}
                isLoading={isPending}
              >
                Continue
              </Button>
            </div>
          )}
        </div>
      </div>
    </OnboardingLayout>
  )
}

