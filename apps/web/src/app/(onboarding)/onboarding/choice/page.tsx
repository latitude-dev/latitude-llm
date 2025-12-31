'use client'

import { useCallback } from 'react'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { useHover } from '@latitude-data/web-ui/browser'
import { cn } from '@latitude-data/web-ui/utils'

type OnboardingChoice = 'product_engineer' | 'developer' | null

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: IconName
  title: string
  description: string
  onClick: () => void
}) {
  const [ref, isHovered] = useHover<HTMLDivElement>()

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-6 p-8 rounded-lg',
        'transition-colors cursor-pointer',
        'border border-border hover:border-primary',
        'bg-background hover:bg-accent',
      )}
      ref={ref}
      onClick={onClick}
    >
      <div
        className={cn('rounded-full p-4 w-fit border transition-colors', {
          'bg-muted border-muted': !isHovered,
          'bg-primary border-primary': isHovered,
        })}
      >
        <Icon
          name={icon}
          size='large'
          color={isHovered ? 'white' : 'foregroundMuted'}
        />
      </div>
      <div className='flex flex-col items-start gap-2'>
        <Text.H4M>{title}</Text.H4M>
        <Text.H6 color='foregroundMuted'>{description}</Text.H6>
      </div>
    </div>
  )
}

export default function OnboardingChoicePage() {
  const router = useNavigate()
  const { setValue: setOnboardingChoice } = useLocalStorage<OnboardingChoice>({
    key: AppLocalStorage.onboardingChoice,
    defaultValue: null,
  })

  const handleStartFromScratch = useCallback(() => {
    setOnboardingChoice('product_engineer')
    router.push(ROUTES.onboarding.promptEngineering.pasteYourPrompt)
  }, [setOnboardingChoice, router])

  const handleExistingProject = useCallback(() => {
    setOnboardingChoice('developer')
    router.push(ROUTES.onboarding.install)
  }, [setOnboardingChoice, router])

  return (
    <div className='flex flex-col items-center justify-center min-h-screen p-8'>
      <div className='flex flex-col items-center gap-8 max-w-2xl w-full'>
        <div className='flex flex-col items-center gap-4'>
          <Icon name='logo' size='xlarge' />
          <Text.H2M color='foreground'>Welcome to Latitude</Text.H2M>
          <Text.H5 color='foregroundMuted' centered>
            How would you like to get started?
          </Text.H5>
        </div>

        <div className='flex flex-col md:flex-row gap-6 w-full'>
          <ChoiceCard
            icon='code'
            title='I have an existing project'
            description='Already have an AI-powered project? Install Latitude to monitor and improve your existing setup.'
            onClick={handleExistingProject}
          />

          <ChoiceCard
            icon='coffee'
            title='Start from scratch'
            description='Create a new prompt from scratch and learn the basics of Latitude through a guided experience.'
            onClick={handleStartFromScratch}
          />
        </div>
      </div>
    </div>
  )
}
