'use client'

import { useState } from 'react'
import { FocusLayout } from '$/components/layouts'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import QuestionnaireOptions from './_components/QuestionnaireOptions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

enum OnboardingOptions {
  buildAgents = 'Build AI Agents',
  promptEngineering = 'Prompt Engineering',
}
const options = [
  {
    title: OnboardingOptions.buildAgents,
    description:
      "I want to use Latitude's advance agent building tools to optimise routine tasks.",
  },
  {
    title: OnboardingOptions.promptEngineering,
    description:
      'I want to use Latitude to build, test & implement bulletproof prompts for LLMs',
  },
]

export default function QuestionnairePage() {
  const [selectedOption, setSelectedOption] =
    useState<OnboardingOptions | null>(OnboardingOptions.buildAgents)

  const startOnboardingBasedOnOption = () => {
    if (selectedOption === OnboardingOptions.buildAgents) {
      return redirect(ROUTES.onboarding.agents.selectAgent)
    }
    return redirect(ROUTES.onboarding.promptEngineering)
  }

  return (
    <FocusLayout
      header={
        <FocusHeader
          title='How do you plan to use Latitude?'
          description='Your answer helps us personalize Latitude to your needs.'
        />
      }
    >
      <div className='flex flex-col gap-y-2'>
        {options.map((option, index) => (
          <QuestionnaireOptions
            key={index}
            title={option.title}
            description={option.description}
            isSelected={selectedOption === option.title}
            onClick={() => setSelectedOption(option.title)}
          />
        ))}
      </div>
      <div className='flex flex-col justify-center mx-auto'>
        <Button
          disabled={!selectedOption}
          fancy
          iconProps={{ name: 'chevronRight', placement: 'right' }}
          onClick={startOnboardingBasedOnOption}
        >
          Start Latitude
        </Button>
      </div>
    </FocusLayout>
  )
}
