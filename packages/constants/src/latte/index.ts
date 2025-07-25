export * from './actions'

export enum LatteTool {
  think = 'think',

  listProjects = 'list_projects',
  listDrafts = 'list_drafts',

  listPrompts = 'list_prompts',
  readPrompt = 'read_prompt',
  editProject = 'edit_project',

  listProviders = 'list_providers',
  listIntegrations = 'list_integrations',
  listIntegrationTools = 'list_integration_tools',

  searchIntegrationApps = 'search_integration_apps',
  searchIntegrationResources = 'search_integration_resources',
  createIntegration = 'create_integration',
}
