export type ProductAccess = {
  promptManagement: boolean
  agentBuilder: boolean
}

export function computeProductAccess(workspace: {
  promptManagerEnabled: boolean
  agentBuilderEnabled: boolean
}): ProductAccess {
  return {
    promptManagement: workspace.promptManagerEnabled,
    agentBuilder:
      workspace.agentBuilderEnabled && workspace.promptManagerEnabled,
  }
}
