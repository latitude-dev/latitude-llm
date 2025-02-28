import { PromptConfig, ToolsItem } from '@latitude-data/constants'
import { Integration } from '@latitude-data/core/browser'
import { omit } from 'lodash-es'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type ActiveIntegrations = Record<string, true | string[]> // true means '*'

function readActiveIntegrations({
  config,
  integrations,
}: {
  config: PromptConfig
  integrations: Integration[]
}) {
  const selectedIntegrations: ActiveIntegrations = {}
  if (config.tools && Array.isArray(config.tools)) {
    config.tools.forEach((tool) => {
      if (typeof tool === 'string') {
        const [integrationName, toolName] = tool.split('/')
        if (!integrationName || !toolName) return
        if (selectedIntegrations[integrationName] === true) return
        if (
          integrationName !== 'latitude' &&
          !integrations.some((i) => i.name === integrationName)
        )
          return
        const existing = selectedIntegrations[integrationName] ?? []
        selectedIntegrations[integrationName] =
          toolName === '*' ? true : [...existing, toolName]
      }
    })

    config.latitudeTools?.forEach((latitudeTool) => {
      if (selectedIntegrations['latitude'] === true) return
      const existing = selectedIntegrations['latitude'] ?? []
      selectedIntegrations['latitude'] = [...existing, latitudeTool]
    })
  }
  return selectedIntegrations
}

// Converts the old tools format to the regular one
function normalizeIntegrations(config: PromptConfig) {
  if (!config.tools && !config.latitudeTools) return config
  if (config.tools && !Array.isArray(config.tools)) {
    config.tools = Object.entries(config.tools).map(
      ([toolName, toolDefinition]) => ({ [toolName]: toolDefinition }),
    )
  }
  ;(config.tools as ToolsItem[]).push(...(config.latitudeTools ?? []))
  return omit(config, 'latitudeTools')
}

function addIntegrationToConfig({
  config,
  integrationId,
}: {
  config: PromptConfig
  integrationId: string
}) {
  if (config.tools) config = normalizeIntegrations(config)
  const tools = (config.tools as ToolsItem[]) ?? []
  const clientTools = tools.filter(
    (tool: ToolsItem) => typeof tool !== 'string',
  )
  const integrationTools = tools.filter(
    (tool: ToolsItem) => typeof tool === 'string',
  )
  const [integrationName, toolName] = integrationId.split('/')
  if (integrationTools.includes(`${integrationName}/*`)) return config
  if (integrationTools.includes(`${integrationName}/${toolName}`)) return config

  if (toolName === '*') {
    const otherIntegrationTools = integrationTools.filter(
      (integrationId) => integrationId.split('/')[0] !== integrationName,
    )
    config.tools = [...clientTools, ...otherIntegrationTools, integrationId]
    return config
  }

  config.tools = [...clientTools, ...integrationTools, integrationId]
  return config
}

function removeIntegrationFromConfig({
  config,
  integrationId,
  integrationToolNames,
}: {
  config: PromptConfig
  integrationId: string
  integrationToolNames: string[]
}) {
  if (config.tools) config = normalizeIntegrations(config)
  const tools = (config.tools as ToolsItem[]) ?? []
  const [removedIntegrationName, removedToolName] = integrationId.split('/')
  const toolsFromIntegration = tools.filter((tool: ToolsItem) => {
    if (typeof tool !== 'string') return false
    const [integrationName] = tool.split('/')
    return integrationName === removedIntegrationName
  })
  const otherTools = tools.filter(
    (tool) => !toolsFromIntegration.includes(tool),
  )

  const remainingToolsFromIntegration = toolsFromIntegration.filter(
    (tool: ToolsItem) => {
      if (typeof tool !== 'string') return false
      const [, toolName] = tool.split('/')
      if (removedToolName === '*') return false
      return toolName !== removedToolName
    },
  )

  const newToolsFromIntegration =
    removedToolName !== '*' &&
    remainingToolsFromIntegration.includes(`${removedIntegrationName}/*`)
      ? integrationToolNames.filter(
          (toolName) =>
            toolName !== removedToolName &&
            !remainingToolsFromIntegration.includes(
              `${removedIntegrationName}/${toolName}`,
            ),
        )
      : []

  config.tools = [
    ...otherTools,
    ...remainingToolsFromIntegration,
    ...newToolsFromIntegration,
  ]
  return config
}

export const useActiveIntegrations = ({
  config: promptConfig,
  setConfig: setPromptConfig,
  integrations,
}: {
  config: Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
  integrations: Integration[]
  disabled?: boolean
}) => {
  const [localConfig, setLocalConfig] = useState<PromptConfig>(
    promptConfig as PromptConfig,
  )
  const activeIntegrations = useMemo(
    () => readActiveIntegrations({ config: localConfig, integrations }),
    [localConfig],
  )

  useEffect(() => {
    setLocalConfig(promptConfig as PromptConfig)
  }, [promptConfig])

  const setConfig = (config: Record<string, unknown>) => {
    setLocalConfig(config as PromptConfig)
    setPromptConfig(config)
  }

  const addIntegration = useCallback(
    (integrationId: string) => {
      setConfig(addIntegrationToConfig({ config: localConfig, integrationId }))
    },
    [localConfig],
  )
  const removeIntegration = useCallback(
    (integrationId: string, integrationToolNames: string[]) => {
      setConfig(
        removeIntegrationFromConfig({
          config: localConfig,
          integrationId,
          integrationToolNames,
        }),
      )
    },
    [localConfig],
  )

  return {
    activeIntegrations,
    addIntegration,
    removeIntegration,
  }
}
