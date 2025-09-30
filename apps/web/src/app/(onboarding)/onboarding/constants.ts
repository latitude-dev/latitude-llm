import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'

export const ONBOARDING_STEP_CONTENT: Record<
  OnboardingStepKey,
  {
    title: string
    description: string
  }
> = {
  [OnboardingStepKey.SetupIntegrations]: {
    title: 'Set up integrations',
    description: 'Enable agent to connect to apps',
  },
  [OnboardingStepKey.ConfigureTriggers]: {
    title: 'Configure triggers',
    description: 'Adjust triggers to your use case',
  },
  [OnboardingStepKey.TriggerAgent]: {
    title: 'Trigger agent',
    description: 'Wait for an event or trigger agent directly',
  },
  [OnboardingStepKey.RunAgent]: {
    title: 'Run',
    description: 'Watch agent perform',
  },
}

export enum StatusFlagState {
  pending = 'pending',
  inProgress = 'inProgress',
  completed = 'completed',
}
