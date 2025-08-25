export * from './actions'
export * from './triggers'

export enum LatteTool {
  think = 'think',

  listProjects = 'list_projects',
  listDrafts = 'list_drafts',

  listPrompts = 'list_prompts',
  readPrompt = 'read_prompt',
  writePrompt = 'write_prompt',
  editProject = 'edit_project',

  listProviders = 'list_providers',
  listIntegrations = 'list_integrations',
  listIntegrationTools = 'list_integration_tools',

  searchIntegrationApps = 'search_integration_apps',
  searchIntegrationResources = 'search_integration_resources',
  createIntegration = 'create_integration',
  listIntegrationTriggers = 'list_integration_triggers',
  listExistingTriggers = 'list_existing_triggers',

  getFullTriggerSchema = 'get_full_trigger_schema',
  validateTriggerSchema = 'validate_trigger_schema',
  triggerActions = 'trigger_actions',
}

export const LATTE_COST_PROVIDER = 'openai'
export const LATTE_COST_MODEL = 'gpt-5'
export const LATTE_COST_PER_CREDIT = 200_000 // $0.20
export const LATTE_COST_FEE_FACTOR = 1.1 // 10%
export const LATTE_MINIMUM_CREDITS_PER_REQUEST = 1

export type LatteUsage = {
  included: number | 'unlimited'
  billable: number
  unbillable: number
  resetsAt: Date
}

export const LATTE_USAGE_CACHE_KEY = (workspaceId: number) =>
  `latte:usage:${workspaceId}`

export const LATTE_USAGE_CACHE_TTL = 1 * 24 * 60 * 60 // 1 day
