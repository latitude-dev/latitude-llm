import { ToolsItem } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { useCallback, useState } from 'react'
import { useEvents } from '$/lib/events'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import useIntegrations from '$/stores/integrations'
import { IntegrationDto } from '@latitude-data/core/schema/models/types/Integration'

export type ActiveIntegrations = Record<string, true | string[]> // true means '*'

export function useActiveIntegrations({
  prompt,
  onChangePrompt,
}: {
  prompt: string
  onChangePrompt: (prompt: string) => void
}) {
  const { data: integrations, isLoading } = useIntegrations()
  const [promptConfig, setPromptConfig] = useState<LatitudePromptConfig>(
    {} as LatitudePromptConfig,
  )
  const [isInitialized, setInitialized] = useState(false)
  const [activeIntegrations, setActiveIntegrations] =
    useState<ActiveIntegrations>({})
  const addIntegrationTool = useCallback(
    (integrationName: string, toolName: string) => {
      // Local state
      setActiveIntegrations((prev) => {
        return addIntegrationToActiveIntegrations({
          activeIntegrations: prev,
          integrationName,
          toolName,
        })
      })

      // External state
      const updatedPrompt = updatePromptMetadata(prompt, {
        tools: updateExistingToolsFromConfig({
          tools: promptConfig.tools,
          integrationName,
          toolName,
        }),
      })
      onChangePrompt(updatedPrompt)
    },
    [promptConfig, prompt, onChangePrompt],
  )

  const removeIntegrationTool = useCallback(
    (
      integrationName: string,
      toolName: string,
      integrationToolNames: string[],
    ) => {
      // Local state
      setActiveIntegrations((prev) => {
        return removeIntegrationFromActiveIntegrations({
          activeIntegrations: prev,
          integrationName,
          toolName,
          integrationToolNames,
        })
      })

      // External state
      const updatedPrompt = updatePromptMetadata(prompt, {
        tools: removeToolsFromConfigTools({
          tools: promptConfig.tools,
          integrationName,
          toolName,
          integrationToolNames,
        }),
      })
      onChangePrompt(updatedPrompt)
    },
    [promptConfig, onChangePrompt, prompt],
  )

  // Use the same event-driven pattern as ProviderModelSelector
  useEvents({
    onPromptMetadataChanged: ({ promptLoaded, metadata }) => {
      const isReady = promptLoaded && !isLoading
      if (!metadata) return
      if (!isReady) return
      if (!isInitialized) {
        setInitialized(true)
      }

      const active = readActiveIntegrations({
        tools: metadata.config?.tools as LatitudePromptConfig['tools'],
        integrations,
      })
      setActiveIntegrations(active)
      setPromptConfig(metadata?.config as LatitudePromptConfig)
    },
  })

  return {
    isInitialized,
    isLoading,
    activeIntegrations,
    addIntegrationTool,
    removeIntegrationTool,
  }
}

function isValidIntegration(name: string, integrations: IntegrationDto[]) {
  return (
    name === 'latitude' ||
    integrations.some((integration) => integration.name === name)
  )
}

function readActiveIntegrations({
  integrations,
  tools,
}: {
  integrations: IntegrationDto[]
  tools?: LatitudePromptConfig['tools']
}) {
  if (!tools) return {}
  if (!Array.isArray(tools)) return {}

  return tools.reduce((acc, tool) => {
    if (typeof tool !== 'string') return acc

    const [integrationName, toolName] = tool.split('/')

    if (!integrationName || !toolName) return acc
    if (!isValidIntegration(integrationName, integrations)) return acc
    if (acc[integrationName] === true) return acc

    const existing = acc[integrationName] ?? []
    acc[integrationName] = toolName === '*' ? true : [...existing, toolName]

    return acc
  }, {} as ActiveIntegrations)
}

function removeIntegrationFromActiveIntegrations({
  activeIntegrations,
  integrationName,
  toolName,
  integrationToolNames,
}: {
  activeIntegrations: ActiveIntegrations
  integrationName: string
  toolName: string
  integrationToolNames: string[]
}) {
  if (!activeIntegrations[integrationName]) return activeIntegrations

  if (toolName === '*') {
    const { [integrationName]: _, ...rest } = activeIntegrations
    return rest
  }

  if (activeIntegrations[integrationName] === true) {
    // If it was '*', replace with all tools except the removed one
    const remainingTools = integrationToolNames.filter((tn) => tn !== toolName)
    if (remainingTools.length === 0) {
      const { [integrationName]: _, ...rest } = activeIntegrations
      return rest
    }
    return { ...activeIntegrations, [integrationName]: remainingTools }
  }

  if (!Array.isArray(activeIntegrations[integrationName]))
    return activeIntegrations
  const remaining = (activeIntegrations[integrationName] as string[]).filter(
    (tn) => tn !== toolName,
  )

  if (remaining.length === 0) {
    const { [integrationName]: _, ...rest } = activeIntegrations
    return rest
  }

  return { ...activeIntegrations, [integrationName]: remaining }
}

function addIntegrationToActiveIntegrations({
  activeIntegrations,
  integrationName,
  toolName,
}: {
  activeIntegrations: ActiveIntegrations
  integrationName: string
  toolName: string
}) {
  if (activeIntegrations[integrationName] === true) return activeIntegrations
  if (
    activeIntegrations[integrationName] &&
    Array.isArray(activeIntegrations[integrationName]) &&
    activeIntegrations[integrationName].includes(toolName)
  ) {
    return activeIntegrations
  }

  const existing = activeIntegrations[integrationName] ?? []
  return {
    ...activeIntegrations,
    [integrationName]:
      toolName === '*'
        ? true
        : [...(Array.isArray(existing) ? existing : []), toolName],
  } satisfies ActiveIntegrations
}

// Converts the old tools format to the regular one
function normalizeIntegrations(tools: LatitudePromptConfig['tools']) {
  if (!tools) return []
  if (Array.isArray(tools)) return tools

  return Object.entries(tools).map(([toolName, toolDefinition]) => ({
    [toolName]: toolDefinition,
  }))
}

function updateExistingToolsFromConfig({
  tools: currentTools,
  integrationName,
  toolName,
}: {
  tools: LatitudePromptConfig['tools']
  integrationName: string
  toolName: string
}) {
  const tools = (normalizeIntegrations(currentTools) as ToolsItem[]) ?? []
  const clientTools = tools.filter(
    (tool: ToolsItem) => typeof tool !== 'string',
  )
  const integrationTools = tools.filter(
    (tool: ToolsItem) => typeof tool === 'string',
  )
  if (integrationTools.includes(`${integrationName}/*`)) return tools
  if (integrationTools.includes(`${integrationName}/${toolName}`)) return tools

  if (toolName === '*') {
    const otherIntegrationTools = integrationTools.filter(
      (integrationId) => integrationId.split('/')[0] !== integrationName,
    )
    return [...clientTools, ...otherIntegrationTools, `${integrationName}/*`]
  }

  return [...clientTools, ...integrationTools, `${integrationName}/${toolName}`]
}

function removeToolsFromConfigTools({
  tools: currentTools,
  integrationName: removedIntegrationName,
  toolName: removedToolName,
  integrationToolNames,
}: {
  tools: LatitudePromptConfig['tools']
  integrationName: string
  toolName: string
  integrationToolNames: string[]
}) {
  const tools = (normalizeIntegrations(currentTools) as ToolsItem[]) ?? []

  if (removedToolName === '*') {
    return tools.filter((tool: ToolsItem) => {
      if (typeof tool !== 'string') return true

      return !tool.startsWith(`${removedIntegrationName}/`)
    })
  }

  const integrationToolsToAdd = tools.includes(`${removedIntegrationName}/*`)
    ? integrationToolNames.filter((tn) => tn !== removedToolName)
    : []

  return tools
    .filter((tool: ToolsItem) => {
      if (typeof tool !== 'string') return true
      const [integrationName, toolName] = tool.split('/')
      if (integrationName !== removedIntegrationName) return true
      if (toolName === '*') return false
      if (integrationToolsToAdd.includes(toolName ?? '*')) return false
      return toolName !== removedToolName
    })
    .concat(
      integrationToolsToAdd.map((tn) => `${removedIntegrationName}/${tn}`),
    )
}
