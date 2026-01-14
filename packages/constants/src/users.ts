export enum UserTitle {
  Engineer = 'engineer',
  DataAIAndML = 'data_ai_ml',
  ProductManager = 'product_manager',
  Designer = 'designer',
  Founder = 'founder',
  Other = 'other',
}

export const USER_TITLES = Object.values(UserTitle)

export enum AIUsageStage {
  NotInProduction = 'not_in_production',
  InternalToolOnly = 'internal_tool_only',
  LiveWithCustomers = 'live_with_customers',
}

export const AI_USAGE_STAGES = Object.values(AIUsageStage)

export enum LatitudeGoal {
  ObservingTraces = 'observing_traces',
  SettingUpEvaluations = 'setting_up_evaluations',
  ManagingPromptVersions = 'managing_prompt_versions',
  ImprovingAccuracy = 'improving_accuracy',
  ImprovingLatency = 'improving_latency',
  JustExploring = 'just_exploring',
  Other = 'other',
}

export const LATITUDE_GOALS = Object.values(LatitudeGoal)
