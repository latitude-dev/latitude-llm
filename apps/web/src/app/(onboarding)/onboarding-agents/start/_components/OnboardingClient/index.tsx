'use client'

import AgentOnboardingNavbar from '../Navbar/AgentOnboardingNavbar'
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
import { OnboardingStep } from '$/app/(onboarding)/_lib/OnboardingStep'
import { PlaygroundProvider } from '../../lib/PlaygroundProvider'
import { MetadataProvider } from '$/components/MetadataProvider'
import { User } from '@latitude-data/core/schema/models/types/User'

export function OnboardingClient({
  onboardingSteps,
  user,
}: {
  user: User
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

  return (
    <MetadataProvider>
      <PlaygroundProvider>
        <div className='flex flex-row flex-1 items-start'>
          <AgentOnboardingNavbar
            onboardingSteps={onboardingSteps}
            executeCompleteOnboarding={executeCompleteOnboarding}
            currentStep={currentStep}
            isLoadingOnboarding={isLoadingOnboarding}
            user={user}
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
                currentStep={currentStep}
                executeCompleteOnboarding={executeCompleteOnboarding}
              />
            )}
          </div>
        </div>
      </PlaygroundProvider>
    </MetadataProvider>
  )
}

function PlaygroundSteps({
  moveNextOnboardingStep,
  currentStep,
  executeCompleteOnboarding,
}: {
  moveNextOnboardingStep: ({
    currentStep,
  }: {
    currentStep: OnboardingStepKey
  }) => void
  currentStep: OnboardingStepKey
  executeCompleteOnboarding: ({
    projectId,
    commitUuid,
  }: {
    projectId: number
    commitUuid: string
  }) => void
}) {
  const [parameters, setParameters] = useState<Record<string, unknown>>({})

  return (
    <>
      {currentStep === OnboardingStepKey.TriggerAgent && (
        <OnboardingStep.Root>
          <TriggerAgentHeader />
          <TriggerAgentBody
            moveNextOnboardingStep={moveNextOnboardingStep}
            setParameters={setParameters}
          />
        </OnboardingStep.Root>
      )}
      {currentStep === OnboardingStepKey.RunAgent && (
        <OnboardingStep.Root>
          <RunAgentHeader />
          <RunAgentBody
            executeCompleteOnboarding={executeCompleteOnboarding}
            parameters={parameters}
          />
        </OnboardingStep.Root>
      )}
    </>
  )
}
