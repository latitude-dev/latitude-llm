'use client'

import NocodersNavbar from '../Navbar/NocodersNavbar'
import { SetupIntegrationsStep } from './setupIntegrations'
import useWorkspaceOnboarding from '$/stores/workspaceOnboarding'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { ConfigureTriggersStep } from './configureTriggers'
import { TriggerAgentStep } from './triggerAgent'

export function OnboardingClient() {
  const {
    onboarding: currentOnboarding,
    moveNextOnboardingStep,
    isLoading: isLoadingOnboarding,
  } = useWorkspaceOnboarding()

  const currentStep = currentOnboarding?.currentStep

  return (
    <div className='flex flex-row flex-1 items-start self-stretch'>
      <NocodersNavbar
        currentStep={currentStep}
        isLoadingOnboarding={isLoadingOnboarding}
      />
      <div className='flex-row flex-1 h-full'>
        {currentStep === OnboardingStepKey.SetupIntegrations && (
          <SetupIntegrationsStep
            moveNextOnboardingStep={moveNextOnboardingStep}
          />
        )}
        {currentStep === OnboardingStepKey.ConfigureTriggers && (
          <ConfigureTriggersStep
            moveNextOnboardingStep={moveNextOnboardingStep}
          />
        )}
        {currentStep === OnboardingStepKey.TriggerAgent && (
          <TriggerAgentStep moveNextOnboardingStep={moveNextOnboardingStep} />
        )}
      </div>
    </div>
  )
}
