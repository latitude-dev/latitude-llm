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

  triggerActions = 'trigger_actions',
}
