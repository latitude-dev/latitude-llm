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

export type NavbarTab = {
  name: NavbarTabName
  title: string
  description: string
  state: StatusFlagState
}

export enum StatusFlagState {
  pending = 'pending',
  inProgress = 'inProgress',
  completed = 'completed',
}
