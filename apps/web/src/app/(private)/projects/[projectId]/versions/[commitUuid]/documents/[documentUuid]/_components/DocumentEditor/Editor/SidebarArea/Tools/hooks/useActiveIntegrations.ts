import { useCallback, useMemo, useRef } from 'react'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import {
  SidebarEditorState,
  useActiveIntegrationsStore,
} from './useActiveIntegrationsStore'
import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { useNavigate } from '$/hooks/useNavigate'
import { executeFetch } from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { UpdateDocumentContentResponse } from '@latitude-data/core/services/documents/updateDocumentContent/updateContent'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import { updateToolsFromActiveIntegrations } from '../../toolsHelpers/updateConfigWithActiveTools'
import { trigger } from '$/lib/events'
import { ResolvedMetadata } from '$/workers/readMetadata'

export function useActiveIntegrations() {
  const updateController = useRef<AbortController | null>(null)
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document, mutateDocumentUpdated } = useCurrentDocument()
  const {
    addIntegration,
    addTool,
    removeTool,
    removeIntegration: removeIntegrationFromStore,
  } = useActiveIntegrationsStore((state) => ({
    addIntegration: state.addIntegration,
    addTool: state.addTool,
    removeTool: state.removeTool,
    removeIntegration: state.removeIntegration,
  }))

  const updateDocumentContent = useCallback(
    async ({ state }: { state: SidebarEditorState }) => {
      if (updateController.current) {
        updateController.current.abort()
      }

      updateController.current = new AbortController()

      const updatedPrompt = updatePromptMetadata(document.content, {
        tools: updateToolsFromActiveIntegrations({
          currentTools: state.promptConfigTools,
          activeIntegrations: state.integrationsMap,
        }),
      })
      await executeFetch<UpdateDocumentContentResponse>({
        method: 'POST',
        route: ROUTES.api.projects
          .detail(project.id)
          .commits.detail(commit.uuid)
          .documents.detail(document.documentUuid).updateDocumentContent.root,
        toast,
        abortSignal: updateController.current.signal,
        navigate,
        currentUrl,
        body: { prompt: updatedPrompt },
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
      document,
      mutateDocumentUpdated,
    ],
  )
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

  return useMemo(
    () => ({
      addNewIntegration,
      addIntegrationTool,
      removeIntegrationTool,
      removeIntegration,
    }),
    [
      addNewIntegration,
      addIntegrationTool,
      removeIntegrationTool,
      removeIntegration,
    ],
  )
}

export function removeIntegrationFromActiveIntegrations({
  activeIntegrations,
  integrationName,
  toolName,
  integrationToolNames,
}: {
  activeIntegrations: any
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
