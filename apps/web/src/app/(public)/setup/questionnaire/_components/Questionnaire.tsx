'use client'

import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'
import { useState } from 'react'
import QuestionnaireOptions from './QuestionnaireOptions'
import { Button } from '@latitude-data/web-ui/atoms/Button'

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

export default function Questionnaire() {
  const [selectedOption, setSelectedOption] =
    useState<OnboardingOptions | null>(OnboardingOptions.buildAgents)

  const startOnboardingBasedOnOption = () => {
    if (selectedOption === OnboardingOptions.buildAgents) {
      return redirect(ROUTES.onboarding.agents.selectAgent)
    }
    return redirect(ROUTES.onboarding.promptEngineering)
  }

  return (
    <div className='flex flex-col gap-y-8'>
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
    </div>
  )
}
