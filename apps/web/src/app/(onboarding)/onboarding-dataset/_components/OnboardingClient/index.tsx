'use client'

import { DatasetOnboardingStepRoot } from '$/app/(onboarding)/_lib/OnboardingStep'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'
import { DatasetOnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { PasteYourPromptBody } from './PasteYourPrompt'
import OnboardingHeader from '../OnboardingHeader'
import { User } from '@latitude-data/core/schema/models/types/User'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

export function OnboardingClient({
  user,
  document,
}: {
  user: User
  document: DocumentVersion
}) {
  const { onboarding } = useWorkspaceOnboarding()

  const currentStep = onboarding?.currentStep
    ? onboarding?.currentStep
    : DatasetOnboardingStepKey.PasteYourPrompt

  return (
    <div className='flex flex-col flex-1 h-full'>
      {currentStep === DatasetOnboardingStepKey.PasteYourPrompt && (
        <DatasetOnboardingStepRoot>
          <OnboardingHeader user={user} />
          <PasteYourPromptBody document={document} />
        </DatasetOnboardingStepRoot>
      )}
    </div>
  )
}
