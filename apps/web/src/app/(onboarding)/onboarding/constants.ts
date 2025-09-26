import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'

export const ONBOARDING_STEP_CONTENT: Record<
  OnboardingStepKey,
  {
    title: string
    description: string
  }
> = {
  SetupIntegrations: {
    title: 'Set up integrations',
    description: 'Enable agent to connect to apps',
  },
  ConfigureTriggers: {
    title: 'Configure triggers',
    description: 'Adjust triggers to your use case',
  },
  TriggerAgent: {
    title: 'Trigger agent',
    description: 'Wait for an event or trigger agent directly',
  },
  RunAgent: {
    title: 'Run',
    description: 'Watch agent perform',
  },
}

export enum OnboardingStep {
  SetupIntegrations = 1,
  ConfigureTriggers = 2,
  TriggerAgent = 3,
  RunAgent = 4,
}

export enum NavbarTabName {
  SetupIntegrations = 'setupIntegrations',
  ConfigureTriggers = 'configureTriggers',
  TriggerAgent = 'triggerAgent',
  RunAgent = 'runAgent',
}

export enum StatusFlagState {
  pending = 'pending',
  inProgress = 'inProgress',
  completed = 'completed',
}
