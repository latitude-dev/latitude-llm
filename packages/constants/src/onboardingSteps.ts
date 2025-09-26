export const ONBOARDING_STEPS = {
  SetupIntegrations: {
    order: 1,
    key: 'setupIntegrations',
  },
  ConfigureTriggers: {
    order: 2,
    key: 'configureTriggers',
  },
  TriggerAgent: {
    order: 3,
    key: 'triggerAgent',
  },
  RunAgent: {
    order: 4,
    key: 'runAgent',
  },
} as const

export type OnboardingStepKey = keyof typeof ONBOARDING_STEPS
