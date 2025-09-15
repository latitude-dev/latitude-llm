import { Quota } from '../grants'

export * from './actions'
export * from './triggers'

export enum LatteTool {
  think = 'think',

  listProjects = 'list_projects',
  listDrafts = 'list_drafts',

  listPrompts = 'list_prompts',
  readPrompt = 'read_prompt',
  writePrompt = 'write_prompt',
  deletePrompt = 'delete_prompt',
  editProject = 'edit_project',

  listProviders = 'list_providers',

  listExistingIntegrations = 'list_existing_integrations',
  searchAvailableIntegrations = 'search_available_integrations',
  listIntegrationTools = 'list_integration_tools',
  listIntegrationTriggers = 'list_integration_triggers',

  createIntegration = 'create_integration',

  getFullTriggerSchema = 'get_full_trigger_schema',
  validateTriggerSchema = 'validate_trigger_schema',
  createTrigger = 'create_trigger',
  updateTrigger = 'update_trigger',
  deleteTrigger = 'delete_trigger',
}

export const LATTE_COST_PROVIDER = 'anthropic'
export const LATTE_COST_MODEL = 'claude-sonnet-4-0'
export const LATTE_COST_PER_CREDIT = 200_000 // $0.20
export const LATTE_COST_FEE_FACTOR = 1.1 // 10%
export const LATTE_MINIMUM_CREDITS_PER_REQUEST = 1

export type LatteUsage = {
  limit: Quota
  billable: number
  unbillable: number
  resetsAt: Date
}

export const LATTE_USAGE_CACHE_KEY = (workspaceId: number) =>
  `latte:usage:${workspaceId}`

export const LATTE_USAGE_CACHE_TTL = 1 * 24 * 60 * 60 // 1 day
