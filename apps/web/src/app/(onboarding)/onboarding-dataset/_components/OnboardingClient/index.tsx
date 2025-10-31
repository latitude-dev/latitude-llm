'use client'

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
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useState } from 'react'

export function OnboardingClient({ user }: { user: User }) {
  const { executeCompleteOnboarding } = useWorkspaceOnboarding()
  const { value: initialValue, setValue: setInitialValue } =
    useLocalStorage<BlockRootNode>({
      key: AppLocalStorage.datasetOnboardingInitialValue,
      defaultValue: emptyRootBlock,
    })
  const { value: documentParameters, setValue: setDocumentParameters } =
    useLocalStorage<string[]>({
      key: AppLocalStorage.datasetOnboardingParameters,
      defaultValue: [],
    })
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
            setDocumentParameters={setDocumentParameters}
            initialValue={initialValue}
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
