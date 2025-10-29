'use client'

import { useState } from 'react'
import { DatasetOnboardingStepRoot } from '$/app/(onboarding)/_lib/OnboardingStep'
import { DatasetOnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { PasteYourPromptBody } from './PasteYourPrompt'
import OnboardingHeader from '../OnboardingHeader'
import { User } from '@latitude-data/core/schema/models/types/User'
import { GenerateDatasetBody } from './GenerateDataset'
import useDatasets from '$/stores/datasets'

export function OnboardingClient({ user }: { user: User }) {
  const [currentOnboardingStep, setCurrentOnboardingStep] =
    useState<DatasetOnboardingStepKey>(DatasetOnboardingStepKey.PasteYourPrompt)
  const { runGenerateAction } = useDatasets()

  return (
    <div className='flex flex-col flex-1 h-full'>
      {currentOnboardingStep === DatasetOnboardingStepKey.PasteYourPrompt && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <PasteYourPromptBody
            setCurrentOnboardingStep={setCurrentOnboardingStep}
            runGenerateAction={runGenerateAction}
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
    </div>
  )
}
