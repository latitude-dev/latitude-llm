import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import {
  LATITUDE_TOOLS_CONFIG_NAME,
  LatitudeTool,
} from '@latitude-data/constants'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type PromptConfigurationProps = {
  config: Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
  disabled?: boolean
}

export const useReactiveConfig = ({
  config: promptConfig,
  setConfig: setPromptConfig,
}: PromptConfigurationProps) => {
  const [localConfig, setLocalConfig] = useState(promptConfig)

  useEffect(() => {
    setLocalConfig(promptConfig)
  }, [promptConfig])

  const setConfig = (config: Record<string, unknown>) => {
    setLocalConfig(config)
    setPromptConfig(config)
  }

  return { config: localConfig, setConfig }
}

export const useConfigValue = <T>({
  config,
  setConfig,
  key,
  defaultValue,
}: {
  config: Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => void
  key: string
  defaultValue: T
}) => {
  const value = (config[key] ?? defaultValue) as T
  const setValue = (newValue: T | undefined) => {
    if (newValue !== value) {
      setConfig({ ...config, [key]: newValue })
    }
  }

  return { value, setValue }
}

export const useLatitudeToolsConfig = ({
  config,
  setConfig,
}: PromptConfigurationProps) => {
  const tools = (config[LATITUDE_TOOLS_CONFIG_NAME] ?? []) as LatitudeTool[]
  const toggleTool = (tool: LatitudeTool) => {
    const newTools = tools.includes(tool)
      ? tools.filter((t) => t !== tool)
      : [...tools, tool]
    setConfig({
      ...config,
      [LATITUDE_TOOLS_CONFIG_NAME]: newTools.length ? newTools : undefined,
    })
  }

  return { tools, toggleTool }
}

export const useLatitudeAgentsConfig = ({
  config,
  setConfig,
}: PromptConfigurationProps) => {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const { data: agentToolsMap } = useAgentToolsMap({
    commitUuid: commit.uuid,
    projectId: project.id,
  })

  const availableAgents = useMemo(() => {
    if (!agentToolsMap) return []
    return Object.values(agentToolsMap).filter(
      (agentPath) => agentPath !== document.path,
    )
  }, [agentToolsMap, document.path])

  const { value: selectedAgents, setValue: setSelectedAgents } = useConfigValue<
    string[]
  >({
    config,
    setConfig,
    key: 'agents',
    defaultValue: [],
  })

  const toggleAgent = useCallback(
    (selected: string) => {
      const newAgents = selectedAgents.includes(selected)
        ? selectedAgents.filter((v) => v !== selected)
        : [...selectedAgents, selected]
      setSelectedAgents(newAgents.length ? newAgents : undefined)
    },
    [selectedAgents, setSelectedAgents],
  )

  return { availableAgents, selectedAgents, toggleAgent }
}
