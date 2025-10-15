'use client'

import { useCallback, useState } from 'react'
import SetupFormOptions from './SetupFormOptions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

export enum OnboardingFormOptionIds {
  buildAgents = 'Build AI Agents',
  promptEngineering = 'Prompt Engineering',
}
const options = [
  {
    title: OnboardingFormOptionIds.buildAgents,
    description:
      "I want to use Latitude's advance agent building tools to optimise routine tasks.",
  },
  {
    title: OnboardingFormOptionIds.promptEngineering,
    description:
      'I want to use Latitude to build, test & implement bulletproof prompts for LLMs',
  },
]

export default function SetupForm() {
  const [selectedOption, setSelectedOption] = useState<OnboardingFormOptionIds>(
    OnboardingFormOptionIds.buildAgents,
  )

  const { executeCreatePromptEngineeringResources } = useWorkspaceOnboarding()

  const router = useNavigate()
  const startOnboardingBasedOnOption = useCallback(() => {
    if (selectedOption === OnboardingFormOptionIds.buildAgents) {
      return router.push(ROUTES.onboarding.agents.selectAgent)
    }
    executeCreatePromptEngineeringResources()
  }, [selectedOption, executeCreatePromptEngineeringResources, router])

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex flex-col gap-y-2'>
        {options.map((option, index) => (
          <SetupFormOptions
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
