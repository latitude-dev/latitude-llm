'use client'

import { useState } from 'react'
import { DatasetOnboardingStepRoot } from '$/app/(onboarding)/_lib/OnboardingStep'
import { DatasetOnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { PasteYourPromptBody } from './PasteYourPrompt'
import OnboardingHeader from '../OnboardingHeader'
import { User } from '@latitude-data/core/schema/models/types/User'
import { GenerateDatasetBody } from './GenerateDataset'
import RunExperimentBody from './RunExperiment'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'

export function OnboardingClient({ user }: { user: User }) {
  const { executeCompleteOnboarding } = useWorkspaceOnboarding()

  const [currentOnboardingStep, setCurrentOnboardingStep] =
    useState<DatasetOnboardingStepKey>(DatasetOnboardingStepKey.PasteYourPrompt)

  return (
    <div className='flex flex-col flex-1 h-full w-full'>
      {currentOnboardingStep === DatasetOnboardingStepKey.PasteYourPrompt && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <PasteYourPromptBody
            setCurrentOnboardingStep={setCurrentOnboardingStep}
          />
        </DatasetOnboardingStepRoot>
      )}
      {currentOnboardingStep === DatasetOnboardingStepKey.GenerateDataset && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <GenerateDatasetBody
            setCurrentOnboardingStep={setCurrentOnboardingStep}
          />
        </DatasetOnboardingStepRoot>
      )}
      {currentOnboardingStep === DatasetOnboardingStepKey.RunExperiment && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <RunExperimentBody
            executeCompleteOnboarding={executeCompleteOnboarding}
          />
        </DatasetOnboardingStepRoot>
      )}
    </div>
  )
}
