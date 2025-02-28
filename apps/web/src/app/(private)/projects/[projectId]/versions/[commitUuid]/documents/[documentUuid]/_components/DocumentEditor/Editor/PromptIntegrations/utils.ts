import { PromptConfig, ToolsItem } from '@latitude-data/constants'
import { Integration } from '@latitude-data/core/browser'
import { omit } from 'lodash-es'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

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
  integrationName,
  toolName,
}: {
  config: PromptConfig
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
  config: PromptConfig
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
  const debouncedSetPromptConfig = useDebouncedCallback(
    (config: Record<string, unknown>) => {
      setPromptConfig(config)
    },
    1000,
    { trailing: true },
  )

  useEffect(() => {
    setLocalConfig(promptConfig as PromptConfig)
  }, [promptConfig])

  const setConfig = (config: Record<string, unknown>) => {
    setLocalConfig(config as PromptConfig)
    debouncedSetPromptConfig(config)
  }

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
    [localConfig],
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
    [localConfig],
  )

  return {
    activeIntegrations,
    addIntegrationTool,
    removeIntegrationTool,
  }
}
