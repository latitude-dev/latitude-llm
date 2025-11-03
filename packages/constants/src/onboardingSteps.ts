export enum OnboardingStepKey {
  SetupIntegrations = 'setupIntegrations',
  ConfigureTriggers = 'configureTriggers',
  TriggerAgent = 'triggerAgent',
  RunAgent = 'runAgent',
}

export const ONBOARDING_STEPS = {
  [OnboardingStepKey.SetupIntegrations]: {
    order: 1,
  },
  [OnboardingStepKey.ConfigureTriggers]: {
    order: 2,
  },
  [OnboardingStepKey.TriggerAgent]: {
    order: 3,
  },
  [OnboardingStepKey.RunAgent]: {
    order: 4,
  },
} as const

export enum DatasetOnboardingStepKey {
  PasteYourPrompt = 'pasteYourPrompt',
  GenerateDataset = 'generateDataset',
  RunExperiment = 'runExperiment',
}

export const DATASET_ONBOARDING_STEPS = {
  [DatasetOnboardingStepKey.PasteYourPrompt]: {
    order: 1,
  },
  [DatasetOnboardingStepKey.GenerateDataset]: {
    order: 2,
  },
  [DatasetOnboardingStepKey.RunExperiment]: {
    order: 3,
  },
} as const
