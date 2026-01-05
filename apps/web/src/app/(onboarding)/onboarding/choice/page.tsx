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

type OnboardingChoice = 'scratch' | 'existing' | null

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
        'flex flex-col gap-4 p-5 rounded-2xl h-full',
        'transition-all cursor-pointer',
        'border-2',
        isHovered
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background',
      )}
      ref={ref}
      onClick={onClick}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
          isHovered ? 'bg-primary' : 'bg-muted',
        )}
      >
        <Icon
          name={icon}
          size='normal'
          color={isHovered ? 'white' : 'foregroundMuted'}
        />
      </div>
      <div className='flex flex-col items-start gap-2'>
        <Text.H3M>{title}</Text.H3M>
        <Text.H5 color='foregroundMuted'>{description}</Text.H5>
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
    setOnboardingChoice('scratch')
    router.push(ROUTES.onboarding.promptEngineering.pasteYourPrompt)
  }, [setOnboardingChoice, router])

  const handleExistingProject = useCallback(() => {
    setOnboardingChoice('existing')
    router.push(ROUTES.onboarding.install)
  }, [setOnboardingChoice, router])

  return (
    <div className='flex flex-col items-center justify-center min-h-screen p-8'>
      <div className='flex flex-col items-center gap-10 max-w-2xl w-full'>
        <div className='flex flex-col items-center gap-4'>
          <Icon name='logo' size='xlarge' />
          <Text.H2M color='foreground'>Welcome to Latitude</Text.H2M>
          <Text.H5 color='foregroundMuted' centered>
            How would you like to get started?
          </Text.H5>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 w-full'>
          <ChoiceCard
            icon='code'
            title='Connect an existing project'
            description='The fastest way to get started. Install Latitude in your existing AI project in just 5 minutes.'
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
