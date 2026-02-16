import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import {
  createRelativePath,
  resolveRelativePath,
} from '@latitude-data/constants'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCallback, useEffect, useMemo, useState } from 'react'

export type PromptConfigurationProps = {
  config: Record<string, unknown>
  canUseSubagents: boolean
  setConfig: (config: Record<string, unknown>) => void
  disabled?: boolean
  fancyButton?: boolean
  showBehaviorSettings?: boolean
}

export const useReactiveConfig = ({
  config: promptConfig,
  setConfig: setPromptConfig,
}: {
  config: PromptConfigurationProps['config']
  setConfig: PromptConfigurationProps['setConfig']
}) => {
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

function getSelectedRelativePath({
  relativePathsList,
  targetAbsolutePath,
  currentAbsolutePath,
}: {
  relativePathsList: string[]
  targetAbsolutePath: string
  currentAbsolutePath: string
}): string | undefined {
  return relativePathsList.filter((relativePath) => {
    const absolutePath = resolveRelativePath(relativePath, currentAbsolutePath)
    return absolutePath === targetAbsolutePath
  })[0]
}

export const useLatitudeAgentsConfig = ({
  config,
  setConfig,
}: PromptConfigurationProps) => {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const { data: agentToolsMap, isLoading } = useAgentToolsMap({
    commitUuid: commit?.uuid,
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

  const selectedAgentsFullPaths = useMemo(() => {
    if (!Array.isArray(selectedAgents)) return []
    return selectedAgents
      .filter(Boolean)
      .map((relativePath) => resolveRelativePath(relativePath, document.path))
  }, [selectedAgents, document.path])

  const toggleAgent = useCallback(
    (agentFullPath: string) => {
      const selectedPath = getSelectedRelativePath({
        relativePathsList: selectedAgents,
        targetAbsolutePath: agentFullPath,
        currentAbsolutePath: document.path,
      })

      if (selectedPath) {
        setSelectedAgents(
          selectedAgents.filter(
            (relativePath) => relativePath !== selectedPath,
          ),
        )
        return
      }

      const selectedRelativePath = createRelativePath(
        agentFullPath,
        document.path,
      )
      setSelectedAgents([...selectedAgents, selectedRelativePath])
    },
    [selectedAgents, setSelectedAgents, document.path],
  )

  return {
    availableAgents,
    selectedAgents: selectedAgentsFullPaths,
    toggleAgent,
    isLoading,
  }
}
