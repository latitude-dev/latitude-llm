'use client'

import NocodersNavbar from '../Navbar/NocodersNavbar'
import {
  SetupIntegrationsHeader,
  SetupIntegrationsBody,
} from './SetupIntegrations'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import {
  ConfigureTriggersHeader,
  ConfigureTriggersBody,
} from './ConfigureTriggers'
import { TriggerAgentHeader, TriggerAgentBody } from './TriggerAgent'
import { useState } from 'react'
import { RunAgentHeader, RunAgentBody } from './RunAgent'
import {
  ActiveTrigger,
  FAKE_DOCUMENT,
} from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/preview/_components/TriggersList'
import { OnboardingStep } from '$/app/(onboarding)/onboarding/lib/OnboardingStep'
import { PlaygroundProvider } from '../../lib/PlaygroundProvider'

export function OnboardingClient({
  onboardingSteps,
}: {
  onboardingSteps: OnboardingStepKey[]
}) {
  const {
    onboarding,
    moveNextOnboardingStep,
    isLoading: isLoadingOnboarding,
    executeCompleteOnboarding,
  } = useWorkspaceOnboarding()

  const currentStep = onboarding?.currentStep
    ? onboarding?.currentStep
    : onboardingSteps[0]

  const [activeTrigger, setActiveTrigger] = useState<ActiveTrigger>({
    document: FAKE_DOCUMENT,
    parameters: {},
  })

  return (
    <div className='flex flex-row flex-1 items-start'>
      <NocodersNavbar
        onboardingSteps={onboardingSteps}
        executeCompleteOnboarding={executeCompleteOnboarding}
        currentStep={currentStep}
        isLoadingOnboarding={isLoadingOnboarding}
      />
      <div className='flex-row flex-1 h-full'>
        {currentStep === OnboardingStepKey.SetupIntegrations && (
          <OnboardingStep.Root>
            <SetupIntegrationsHeader />
            <SetupIntegrationsBody
              moveNextOnboardingStep={moveNextOnboardingStep}
            />
          </OnboardingStep.Root>
        )}
        {currentStep === OnboardingStepKey.ConfigureTriggers && (
          <OnboardingStep.Root>
            <ConfigureTriggersHeader />
            <ConfigureTriggersBody
              moveNextOnboardingStep={moveNextOnboardingStep}
            />
          </OnboardingStep.Root>
        )}
        {(currentStep === OnboardingStepKey.TriggerAgent ||
          currentStep === OnboardingStepKey.RunAgent) && (
          <PlaygroundSteps
            moveNextOnboardingStep={moveNextOnboardingStep}
            setActiveTrigger={setActiveTrigger}
            currentStep={currentStep}
            executeCompleteOnboarding={executeCompleteOnboarding}
            activeTrigger={activeTrigger}
          />
        )}
      </div>
    </div>
  )
}

function PlaygroundSteps({
  moveNextOnboardingStep,
  setActiveTrigger,
  currentStep,
  executeCompleteOnboarding,
  activeTrigger,
}: {
  moveNextOnboardingStep: ({
    currentStep,
  }: {
    currentStep: OnboardingStepKey
  }) => void
  setActiveTrigger: (trigger: ActiveTrigger) => void
  currentStep: OnboardingStepKey
  executeCompleteOnboarding: () => void
  activeTrigger: ActiveTrigger
}) {
  return (
    <PlaygroundProvider>
      {currentStep === OnboardingStepKey.TriggerAgent && (
        <OnboardingStep.Root>
          <TriggerAgentHeader />
          <TriggerAgentBody
            moveNextOnboardingStep={moveNextOnboardingStep}
            setActiveTrigger={setActiveTrigger}
          />
        </OnboardingStep.Root>
      )}
      {currentStep === OnboardingStepKey.RunAgent && (
        <OnboardingStep.Root>
          <RunAgentHeader />
          <RunAgentBody
            executeCompleteOnboarding={executeCompleteOnboarding}
            activeTrigger={activeTrigger}
          />
        </OnboardingStep.Root>
      )}
    </PlaygroundProvider>
  )
}
