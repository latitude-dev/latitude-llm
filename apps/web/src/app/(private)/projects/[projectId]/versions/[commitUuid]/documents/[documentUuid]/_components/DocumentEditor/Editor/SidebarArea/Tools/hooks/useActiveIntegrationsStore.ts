import { create } from 'zustand'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { ActiveIntegration, ActiveIntegrations } from '../../toolsHelpers/types'
import { collectTools } from '../../toolsHelpers/collectTools'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { addTool } from '../../toolsHelpers/addTool'
import { removeTool } from '../../toolsHelpers/removeTool'

export type SidebarEditorState = {
  initialized: boolean
  setInitialized: (initialized: boolean) => void
  promptConfigTools: LatitudePromptConfig['tools']
  integrationsMap: ActiveIntegrations
  integrations: ActiveIntegration[]
  buildIntegrations: (args: {
    tools: LatitudePromptConfig['tools']
    integrations: IntegrationDto[]
  }) => void
  setIntegrationToolNames: (args: {
    integrationName: string
    toolNames: string[]
  }) => void
  toggleIntegration: (integrationName: string) => void
  addIntegration: (args: {
    integration: ActiveIntegration
    toolName: string
  }) => SidebarEditorState
  addTool: (args: {
    integrationName: string
    toolName: string
  }) => SidebarEditorState
  removeTool: (args: {
    integrationName: string
    toolName: string
    allToolNames: string[]
  }) => SidebarEditorState
  removeIntegration: (integrationName: string) => SidebarEditorState
}

export const useActiveIntegrationsStore = create<SidebarEditorState>(
  (set, get) => ({
    initialized: false,
    integrationsMap: {},
    promptConfigTools: [],
    integrations: [],
    setInitialized: (initialized: boolean) =>
      set((state) => ({ ...state, initialized })),
    buildIntegrations: ({ tools, integrations }) => {
      const state = get()
      const integrationsMap = collectTools({
        tools,
        integrations,
        existingMap: state.integrationsMap,
      })

      // Preserve order: keep existing integrations in order, add new ones at the end
      const existingNames = new Set(state.integrations.map((int) => int.name))
      const newIntegrationNames = Object.keys(integrationsMap).filter(
        (name) => !existingNames.has(name),
      )

      const updatedExisting = state.integrations
        .filter((int) => integrationsMap[int.name]) // Remove deleted integrations
        .map((int) => integrationsMap[int.name]) // Update with new data

      const newIntegrations = newIntegrationNames.map(
        (name) => integrationsMap[name],
      )

      const activeIntegrations = [...updatedExisting, ...newIntegrations]

      set((state) => ({
        ...state,
        promptConfigTools: tools,
        initialized: true,
        integrations: activeIntegrations,
        integrationsMap,
      }))
    },
    setIntegrationToolNames: ({ integrationName, toolNames }) => {
      const state = get()
      const integration = state.integrationsMap[integrationName]
      if (!integration) return

      const updatedIntegration = {
        ...integration,
        allToolNames: toolNames,
      }

      const updatedIntegrationsMap = {
        ...state.integrationsMap,
        [integrationName]: updatedIntegration,
      }

      // Preserve order by mapping over existing integrations
      const updatedIntegrations = state.integrations.map((int) =>
        int.name === integrationName ? updatedIntegration : int,
      )

      set((state) => ({
        ...state,
        integrationsMap: updatedIntegrationsMap,
        integrations: updatedIntegrations,
      }))
    },
    toggleIntegration: (integrationName) => {
      const state = get()
      const integration = state.integrationsMap[integrationName]
      if (!integration) return

      const updatedIntegration = {
        ...integration,
        isOpen: !integration.isOpen,
      }

      const updatedIntegrationsMap = {
        ...state.integrationsMap,
        [integrationName]: updatedIntegration,
      }

      // Preserve order by mapping over existing integrations
      const updatedIntegrations = state.integrations.map((int) =>
        int.name === integrationName ? updatedIntegration : int,
      )

      set((state) => ({
        ...state,
        integrationsMap: updatedIntegrationsMap,
        integrations: updatedIntegrations,
      }))
    },
    addIntegration: ({ integration, toolName }) => {
      const state = get()

      // Create the integration with the specified tools
      const newIntegration: ActiveIntegration = {
        ...integration,
        tools: toolName === '*' ? true : [toolName],
        allToolNames: integration.allToolNames || [],
        isOpen: true, // Open newly added integrations by default
      }

      const updatedIntegrationsMap = {
        ...state.integrationsMap,
        [integration.name]: newIntegration,
      }

      // Add new integration at the top of the list
      const existingIntegrations = state.integrations.filter(
        (int) => int.name !== integration.name,
      )
      const updatedIntegrations = [newIntegration, ...existingIntegrations]

      const updatedState = {
        ...state,
        integrationsMap: updatedIntegrationsMap,
        integrations: updatedIntegrations,
      }

      set(updatedState)
      return updatedState
    },
    addTool: ({ integrationName, toolName }) => {
      const state = get()
      const integration = state.integrationsMap[integrationName]
      if (!integration) return state

      const updatedTools = addTool({
        currentActiveTools: integration.tools,
        toolName,
      })

      const updatedIntegration = {
        ...integration,
        tools: updatedTools,
      }

      const updatedIntegrationsMap = {
        ...state.integrationsMap,
        [integrationName]: updatedIntegration,
      }

      // Preserve order by mapping over existing integrations
      const updatedIntegrations = state.integrations.map((int) =>
        int.name === integrationName ? updatedIntegration : int,
      )

      const updatedState = {
        ...state,
        integrationsMap: updatedIntegrationsMap,
        integrations: updatedIntegrations,
      }

      set(updatedState)
      return updatedState
    },
    removeTool: ({ integrationName, toolName, allToolNames = [] }) => {
      const state = get()
      const integration = state.integrationsMap[integrationName]
      if (!integration) return state

      const updatedTools = removeTool({
        currentActiveTools: integration.tools,
        toolName,
        allToolNames,
      })

      const updatedIntegration = {
        ...integration,
        tools: updatedTools,
      }

      const updatedIntegrationsMap = {
        ...state.integrationsMap,
        [integrationName]: updatedIntegration,
      }

      // Preserve order by mapping over existing integrations
      const updatedIntegrations = state.integrations.map((int) =>
        int.name === integrationName ? updatedIntegration : int,
      )

      const updatedState = {
        ...state,
        integrationsMap: updatedIntegrationsMap,
        integrations: updatedIntegrations,
      }

      set(updatedState)
      return updatedState
    },
    removeIntegration: (integrationName) => {
      const state = get()
      const { [integrationName]: _removed, ...remainingIntegrations } =
        state.integrationsMap

      // Preserve order by filtering out the removed integration
      const updatedIntegrations = state.integrations.filter(
        (int) => int.name !== integrationName,
      )

      const updatedState = {
        ...state,
        integrationsMap: remainingIntegrations,
        integrations: updatedIntegrations,
      }

      set(updatedState)
      return updatedState
    },
  }),
)
