'use client'

import { useCallback, useState } from 'react'
import SetupQuestionnaireOptions from './SetupQuestionnaireOptions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

export enum QuestionnaireOptionIds {
  buildAgents = 'Build AI Agents',
  promptEngineering = 'Prompt Engineering',
}
const options = [
  {
    title: QuestionnaireOptionIds.buildAgents,
    description:
      "I want to use Latitude's advance agent building tools to optimise routine tasks.",
  },
  {
    title: QuestionnaireOptionIds.promptEngineering,
    description:
      'I want to use Latitude to build, test & implement bulletproof prompts for LLMs',
  },
]

export default function SetupQuestionnaire() {
  const [selectedOption, setSelectedOption] = useState<QuestionnaireOptionIds>(
    QuestionnaireOptionIds.buildAgents,
  )

  const { executeCreatePromptEngineeringResources } = useWorkspaceOnboarding()

  const router = useNavigate()
  const startOnboardingBasedOnOption = useCallback(() => {
    if (selectedOption === QuestionnaireOptionIds.buildAgents) {
      return router.push(ROUTES.onboarding.agents.selectAgent)
    }
    executeCreatePromptEngineeringResources()
  }, [selectedOption, executeCreatePromptEngineeringResources, router])

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex flex-col gap-y-2'>
        {options.map((option, index) => (
          <SetupQuestionnaireOptions
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
