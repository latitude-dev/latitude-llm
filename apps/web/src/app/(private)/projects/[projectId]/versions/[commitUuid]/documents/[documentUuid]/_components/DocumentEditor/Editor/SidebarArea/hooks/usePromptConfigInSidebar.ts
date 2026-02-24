import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { SidebarEditorState, useSidebarStore } from './useSidebarStore'
import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { useNavigate } from '$/hooks/useNavigate'
import { executeFetch } from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { UpdateDocumentContentResponse } from '@latitude-data/core/services/documents/updateDocumentContent/updateContent'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import { updateToolsFromActiveIntegrations } from '../toolsHelpers/updateConfigWithActiveTools'
import { trigger } from '$/lib/events'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  createRelativePath,
  resolveRelativePath,
} from '@latitude-data/constants'

export function useUpdateDocumentContent() {
  const { toast } = useToast()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()
  const { document, mutateDocumentUpdated } = useCurrentDocument()
  return useCallback(
    async ({
      prompt,
      updates,
      abortSignal,
    }: {
      prompt: string
      updates: Record<string, unknown>
      abortSignal?: AbortSignal
    }) => {
      return await executeFetch<UpdateDocumentContentResponse>({
        method: 'POST',
        route: ROUTES.api.projects
          .detail(project.id)
          .commits.detail(commit.uuid)
          .documents.detail(document.documentUuid).updateDocumentContent.root,
        toast,
        abortSignal,
        navigate,
        currentUrl,
        body: { prompt: updatePromptMetadata(prompt, updates) },
        serializer: (data) => data as UpdateDocumentContentResponse,
        onSuccess: (data) => {
          if (!data) return

          mutateDocumentUpdated(data.document)
          trigger('PromptChanged', { prompt: data.document.content })
          trigger('PromptMetadataChanged', {
            promptLoaded: true,
            metadata: data.metadata as ResolvedMetadata,
          })
        },
      })
    },
    [
      toast,
      navigate,
      currentUrl,
      project,
      commit,
      document.documentUuid,
      mutateDocumentUpdated,
    ],
  )
}

export function usePromptConfigInSidebar() {
  const updateController = useRef<AbortController | null>(null)
  const { document } = useCurrentDocument()
  const documentContentRef = useRef(document.content)
  // To avoid callbacks triggering rerenders downstream
  // on every change of document
  // content
  useEffect(() => {
    documentContentRef.current = document.content
  }, [document.content])

  const {
    addIntegration,
    addTool,
    removeTool,
    removeIntegration: removeIntegrationFromStore,
    selectedAgents,
    toggleAgent: toggleAgentInStore,
  } = useSidebarStore((state) => ({
    addIntegration: state.addIntegration,
    addTool: state.addTool,
    removeTool: state.removeTool,
    removeIntegration: state.removeIntegration,
    selectedAgents: state.selectedAgents,
    toggleAgent: state.toggleAgent,
  }))
  const updateContent = useUpdateDocumentContent()
  const updateDocumentContent = useCallback(
    async ({
      state,
      agents,
    }: {
      state?: SidebarEditorState
      agents?: string[]
    }) => {
      // Abort any pending update
      if (updateController.current) {
        updateController.current.abort()
      }

      updateController.current = new AbortController()

      const updates: Record<string, unknown> = {}

      // Update tools if state is provided
      if (state) {
        updates.tools = updateToolsFromActiveIntegrations({
          currentTools: state.promptConfigTools,
          activeIntegrations: state.integrationsMap,
        })
      }

      // Update agents if provided
      if (agents !== undefined) {
        updates.agents = agents
      }

      await updateContent({
        prompt: documentContentRef.current,
        updates,
        abortSignal: updateController.current.signal,
      })
    },
    [updateContent],
  )

  // Integration (Tools) methods
  const addNewIntegration = useCallback(
    ({
      integration,
      toolName,
    }: {
      integration: Parameters<typeof addIntegration>[0]['integration']
      toolName: string
    }) => {
      const updatedState = addIntegration({ integration, toolName })
      updateDocumentContent({ state: updatedState })
    },
    [addIntegration, updateDocumentContent],
  )

  const addIntegrationTool = useCallback(
    ({
      integrationName,
      toolName,
    }: {
      integrationName: string
      toolName: string
    }) => {
      const updatedState = addTool({ integrationName, toolName })
      updateDocumentContent({ state: updatedState })
    },
    [addTool, updateDocumentContent],
  )

  const removeIntegrationTool = useCallback(
    ({
      integrationName,
      toolName,
      allToolNames,
    }: {
      integrationName: string
      toolName: string
      allToolNames: string[]
    }) => {
      const updatedState = removeTool({
        integrationName,
        toolName,
        allToolNames,
      })
      updateDocumentContent({ state: updatedState })
    },
    [removeTool, updateDocumentContent],
  )

  const removeIntegration = useCallback(
    (integrationName: string) => {
      const updatedState = removeIntegrationFromStore(integrationName)
      updateDocumentContent({ state: updatedState })
    },
    [removeIntegrationFromStore, updateDocumentContent],
  )

  // Agent methods
  const toggleAgent = useCallback(
    (agentFullPath: string) => {
      const selectedPath = selectedAgents.find((relativePath) => {
        const absolutePath = resolveRelativePath(relativePath, document.path)
        return absolutePath === agentFullPath
      })

      let newAgents: string[]
      if (selectedPath) {
        newAgents = selectedAgents.filter((path) => path !== selectedPath)
        toggleAgentInStore(selectedPath)
      } else {
        const selectedRelativePath = createRelativePath(
          agentFullPath,
          document.path,
        )
        newAgents = [...selectedAgents, selectedRelativePath]
        toggleAgentInStore(selectedRelativePath)
      }

      // Persist to document
      updateDocumentContent({ agents: newAgents })
    },
    [selectedAgents, toggleAgentInStore, document.path, updateDocumentContent],
  )

  const setAgents = useCallback(
    (agentFullPaths: string[]) => {
      // Convert full paths to relative paths
      const newAgents = agentFullPaths.map((fullPath) =>
        createRelativePath(fullPath, document.path),
      )

      // Only persist to document - the response will update the store via the effect
      updateDocumentContent({ agents: newAgents })
    },
    [document.path, updateDocumentContent],
  )

  return useMemo(
    () => ({
      addNewIntegration,
      addIntegrationTool,
      removeIntegrationTool,
      removeIntegration,
      toggleAgent,
      setAgents,
    }),
    [
      addNewIntegration,
      addIntegrationTool,
      removeIntegrationTool,
      removeIntegration,
      toggleAgent,
      setAgents,
    ],
  )
}
