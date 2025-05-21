import { ToolsItem } from '@latitude-data/constants'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { IntegrationDto } from '@latitude-data/core/browser'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

export type ActiveIntegrations = Record<string, true | string[]> // true means '*'

function readActiveIntegrations({
  config,
  integrations,
}: {
  config: LatitudePromptConfig
  integrations: IntegrationDto[]
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
  }
  return selectedIntegrations
}

// Converts the old tools format to the regular one
function normalizeIntegrations(config: LatitudePromptConfig) {
  if (!config.tools) return config
  if (config.tools && !Array.isArray(config.tools)) {
    config.tools = Object.entries(config.tools).map(
      ([toolName, toolDefinition]) => ({ [toolName]: toolDefinition }),
    )
  }
  return config
}

function addIntegrationToConfig({
  config,
  integrationName,
  toolName,
}: {
  config: LatitudePromptConfig
  integrationName: string
  toolName: string
}) {
  if (config.tools) config = normalizeIntegrations(config)
  const tools = (config.tools as ToolsItem[]) ?? []
  const clientTools = tools.filter(
    (tool: ToolsItem) => typeof tool !== 'string',
  )
  const integrationTools = tools.filter(
    (tool: ToolsItem) => typeof tool === 'string',
  )
  if (integrationTools.includes(`${integrationName}/*`)) return config
  if (integrationTools.includes(`${integrationName}/${toolName}`)) return config

  if (toolName === '*') {
    const otherIntegrationTools = integrationTools.filter(
      (integrationId) => integrationId.split('/')[0] !== integrationName,
    )
    config.tools = [
      ...clientTools,
      ...otherIntegrationTools,
      `${integrationName}/*`,
    ]
    return config
  }

  config.tools = [
    ...clientTools,
    ...integrationTools,
    `${integrationName}/${toolName}`,
  ]
  return config
}

function removeIntegrationFromConfig({
  config,
  integrationName: removedIntegrationName,
  toolName: removedToolName,
  integrationToolNames,
}: {
  config: LatitudePromptConfig
  integrationName: string
  toolName: string
  integrationToolNames: string[]
}) {
  if (config.tools) config = normalizeIntegrations(config)
  const tools = (config.tools as ToolsItem[]) ?? []

  if (removedToolName === '*') {
    config.tools = tools.filter((tool: ToolsItem) => {
      if (typeof tool !== 'string') return true
      return !tool.startsWith(`${removedIntegrationName}/`)
    })
    return config
  }

  const integrationToolsToAdd = tools.includes(`${removedIntegrationName}/*`)
    ? integrationToolNames.filter((tn) => tn !== removedToolName)
    : []

  config.tools = tools
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

  return config
}

export const useActiveIntegrations = ({
  config: promptConfig,
  setConfig: setPromptConfig,
  integrations,
}: {
  config: Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
  integrations: IntegrationDto[]
  disabled?: boolean
}) => {
  const [localConfig, setLocalConfig] = useState<LatitudePromptConfig>(
    promptConfig as LatitudePromptConfig,
  )
  const activeIntegrations = useMemo(
    () => readActiveIntegrations({ config: localConfig, integrations }),
    [localConfig, integrations],
  )
  const debouncedSetPromptConfig = useDebouncedCallback(
    (config: Record<string, unknown>) => {
      setPromptConfig(config)
    },
    1000,
    { trailing: true },
  )

  useEffect(() => {
    setLocalConfig(promptConfig as LatitudePromptConfig)
  }, [promptConfig])

  const setConfig = useCallback(
    (config: Record<string, unknown>) => {
      setLocalConfig(config as LatitudePromptConfig)
      debouncedSetPromptConfig(config)
    },
    [debouncedSetPromptConfig, setLocalConfig],
  )

  const addIntegrationTool = useCallback(
    (integrationName: string, toolName: string) => {
      setConfig(
        addIntegrationToConfig({
          config: localConfig,
          integrationName,
          toolName,
        }),
      )
    },
    [localConfig, setConfig],
  )
  const removeIntegrationTool = useCallback(
    (
      integrationName: string,
      toolName: string,
      integrationToolNames: string[],
    ) => {
      setConfig(
        removeIntegrationFromConfig({
          config: localConfig,
          integrationName,
          toolName,
          integrationToolNames,
        }),
      )
    },
    [localConfig, setConfig],
  )

  return {
    activeIntegrations,
    addIntegrationTool,
    removeIntegrationTool,
  }
}
