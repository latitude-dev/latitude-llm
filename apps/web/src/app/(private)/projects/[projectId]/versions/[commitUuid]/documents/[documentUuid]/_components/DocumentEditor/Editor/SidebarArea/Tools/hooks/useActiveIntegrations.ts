import { useDocumentValue } from '$/hooks/useDocumentValueContext'
import { useEvents } from '$/lib/events'
import useIntegrations from '$/stores/integrations'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import { IntegrationDto } from '@latitude-data/core/schema/types'
import { useState, useCallback, useMemo } from 'react'
import { ActiveIntegrations } from '../../../PromptIntegrations/useActiveIntegrations'
import {
  addIntegrationToActiveIntegrations,
  updateExistingToolsFromConfig,
  removeToolsFromConfigTools,
} from './utils'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'

export function useActiveIntegrations() {
  const { document } = useCurrentDocument()
  const prompt = document.content
  const { data: integrations, isLoading } = useIntegrations({
    includeLatitudeTools: true,
    withTools: true,
  })

  console.log('Integrations loaded:', { isLoading })

  const { updateDocumentContent } = useDocumentValue()
  const [promptConfig, setPromptConfig] = useState<LatitudePromptConfig>(
    {} as LatitudePromptConfig,
  )
  const [isInitialized, setInitialized] = useState(false)
  const [activeIntegrations, setActiveIntegrations] =
    useState<ActiveIntegrations>({})
  const updatePromptMetadataWithOrigin = useCallback(
    (updatedPrompt: string) => {
      updateDocumentContent(updatedPrompt, { origin: 'editorSidebar' })
    },
    [updateDocumentContent],
  )

  const addIntegrationTool = useCallback(
    ({
      integrationName,
      toolName,
    }: {
      integrationName: string
      toolName: string
    }) => {
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
      updatePromptMetadataWithOrigin(updatedPrompt)
    },
    [promptConfig, prompt, updatePromptMetadataWithOrigin],
  )

  const removeIntegrationTool = useCallback(
    ({
      integrationName,
      toolName,
      integrationToolNames,
    }: {
      integrationName: string
      toolName: string
      integrationToolNames: string[]
    }) => {
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
      updatePromptMetadataWithOrigin(updatedPrompt)
    },
    [promptConfig, prompt, updatePromptMetadataWithOrigin],
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

      // Ignore updates coming from the sidebar itself to avoid loops
      if (metadata.origin === 'editorSidebar') return

      const active = readActiveIntegrations({
        tools: metadata.config?.tools as LatitudePromptConfig['tools'],
        integrations,
      })
      setActiveIntegrations(active)
      setPromptConfig(metadata?.config as LatitudePromptConfig)
    },
  })

  return useMemo(
    () => ({
      isInitialized,
      isLoading,
      activeIntegrations,
      addIntegrationTool,
      removeIntegrationTool,
    }),
    [
      isInitialized,
      isLoading,
      activeIntegrations,
      addIntegrationTool,
      removeIntegrationTool,
    ],
  )
}

export type UseActiveIntegrationsReturn = ReturnType<
  typeof useActiveIntegrations
>

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
