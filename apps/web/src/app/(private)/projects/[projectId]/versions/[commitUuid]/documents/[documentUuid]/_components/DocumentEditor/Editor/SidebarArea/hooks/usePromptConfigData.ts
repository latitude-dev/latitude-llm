import { useEffect, useState, useMemo } from 'react'
import useIntegrations from '$/stores/integrations'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { useSidebarStore } from './useSidebarStore'
import { useEvents } from '$/lib/events'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useDocumentVersions from '$/stores/documentVersions'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'

export function usePromptConfigData() {
  const [promptConfig, setPromptConfig] = useState<LatitudePromptConfig>(
    {} as LatitudePromptConfig,
  )
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const {
    buildIntegrations,
    setSelectedAgents,
    setPathToUuidMap,
    setInitialized,
    initialized,
  } = useSidebarStore((state) => ({
    initialized: state.initialized,
    setInitialized: state.setInitialized,
    buildIntegrations: state.buildIntegrations,
    setSelectedAgents: state.setSelectedAgents,
    setPathToUuidMap: state.setPathToUuidMap,
  }))
  const { data: integrations, isLoading: isLoadingIntegrations } =
    useIntegrations({
      includeLatitudeTools: true,
      withTools: true,
    })

  const { data: _agentToolsMap, isLoading: isLoadingAgents } = useAgentToolsMap(
    {
      commitUuid: commit?.uuid,
      projectId: project.id,
    },
  )

  const { data: documentVersions, isLoading: isLoadingDocuments } =
    useDocumentVersions({
      commitUuid: commit?.uuid,
      projectId: project.id,
    })

  const isLoading =
    isLoadingIntegrations || isLoadingAgents || isLoadingDocuments

  const pathToUuidMap = useMemo(() => {
    if (!documentVersions) return {}
    return documentVersions
      .filter((doc) => doc.documentType === 'agent')
      .reduce(
        (acc, doc) => {
          acc[doc.path] = doc.documentUuid
          return acc
        },
        {} as Record<string, string>,
      )
  }, [documentVersions])

  useEvents({
    onPromptMetadataChanged: ({ promptLoaded, metadata }) => {
      const isReady = promptLoaded && !isLoading
      if (!metadata) return
      if (!isReady) return

      setPromptConfig(metadata?.config as LatitudePromptConfig)
    },
  })

  useEffect(() => {
    if (isLoading) return
    if (!promptConfig) return

    // Initialize integrations (tools)
    buildIntegrations({
      tools: promptConfig.tools,
      integrations: integrations ?? [],
    })

    // Initialize agents
    const agents = promptConfig.agents
    if (agents && Array.isArray(agents)) {
      setSelectedAgents(agents)
    } else {
      setSelectedAgents([])
    }

    // Initialize path to UUID map
    setPathToUuidMap(pathToUuidMap)

    return () => {
      setInitialized(false)
    }
  }, [
    isLoading,
    promptConfig,
    integrations,
    pathToUuidMap,
    buildIntegrations,
    setSelectedAgents,
    setPathToUuidMap,
    setInitialized,
  ])

  return !initialized
}
