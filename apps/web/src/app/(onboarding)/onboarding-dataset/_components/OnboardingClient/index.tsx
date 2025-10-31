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
import { BlockRootNode } from '$/components/BlocksEditor'
import { emptyRootBlock } from '$/components/BlocksEditor/Editor/state/promptlToLexical'

export function OnboardingClient({ user }: { user: User }) {
  const { executeCompleteOnboarding } = useWorkspaceOnboarding()
  const [initialValue, setInitialValue] =
    useState<BlockRootNode>(emptyRootBlock)
  const [documentParameters, setDocumentParameters] = useState<string[]>([])
  const [currentOnboardingStep, setCurrentOnboardingStep] =
    useState<DatasetOnboardingStepKey>(DatasetOnboardingStepKey.PasteYourPrompt)

  return (
    <div className='flex flex-col flex-1 h-full w-full'>
      {currentOnboardingStep === DatasetOnboardingStepKey.PasteYourPrompt && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <PasteYourPromptBody
            setCurrentOnboardingStep={setCurrentOnboardingStep}
            setInitialValue={setInitialValue}
            initialValue={initialValue}
            setDocumentParameters={setDocumentParameters}
          />
        </DatasetOnboardingStepRoot>
      )}
      {currentOnboardingStep === DatasetOnboardingStepKey.GenerateDataset && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <GenerateDatasetBody
            setCurrentOnboardingStep={setCurrentOnboardingStep}
            initialValue={initialValue}
            documentParameters={documentParameters}
          />
        </DatasetOnboardingStepRoot>
      )}
      {currentOnboardingStep === DatasetOnboardingStepKey.RunExperiment && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <RunExperimentBody
            executeCompleteOnboarding={executeCompleteOnboarding}
            documentParameters={documentParameters}
            initialValue={initialValue}
          />
        </DatasetOnboardingStepRoot>
      )}
    </div>
  )
}
