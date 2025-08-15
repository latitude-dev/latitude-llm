'use client'

import { useDevMode } from '$/hooks/useDevMode'
import { useMetadata } from '$/hooks/useMetadata'
import { useNavigate } from '$/hooks/useNavigate'
import { useEvents } from '$/lib/events'
import { ROUTES } from '$/services/routes'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import useFeature from '$/stores/useFeature'
import { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useDebouncedCallback } from 'use-debounce'
import type { ReadMetadataWorkerProps } from '../workers/readMetadata'

export type updateContentFn = (
  content: string,
  opts?: { origin?: ReadMetadataWorkerProps['origin'] },
) => void

type DocumentValueContextType = {
  value: string
  setValue: updateContentFn
  updateDocumentContent: updateContentFn
  isSaved: boolean
}

const DocumentValueContext = createContext<
  DocumentValueContextType | undefined
>(undefined)

type DocumentValueProviderProps = {
  children: ReactNode
  document: DocumentVersion
}

export function DocumentValueProvider({
  children,
  document,
}: DocumentValueProviderProps) {
  const [value, setValue] = useState(document.content)
  console.log('🐛 DocumentValueProvider mounted with:', {
    documentUuid: document.documentUuid,
    documentContent: document.content,
    initialValue: value,
    timestamp: new Date().toISOString(),
  })
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { updateContent, isUpdatingContent } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const { toast } = useToast()
  const { isEnabled: newLatte } = useFeature(project.workspaceId, 'latte')
  const [origin, setOrigin] = useState<string>()
  const setContentValue = useCallback(
    (content: string, opts?: Parameters<updateContentFn>[1]) => {
      setValue(content)
      setOrigin(opts?.origin)
    },
    [setValue, setOrigin],
  )
  const updateDocumentContent = useDebouncedCallback(
    async (content: string, opts?: Parameters<updateContentFn>[1]) => {
      console.log('📝 Updating document content', content, opts)
      setContentValue(content, opts)
      console.log('✅ Document content updated', content)

      const [_, error] = await updateContent({
        commitUuid: commit.uuid,
        projectId: project.id,
        documentUuid: document.documentUuid,
        content,
      })
      if (error) {
        console.error(error)

        toast({
          title: 'Error saving document',
          description: 'There was an error saving the document.',
          variant: 'destructive',
        })
        console.error('🛠️ Error saving document:', error)
        setContentValue(document.content)
      }
    },
    500,
    { leading: false, trailing: true },
  )

  useSyncLatteChanges({
    document,
    updateContent: setContentValue,
    commit,
    project,
    newLatte,
  })
  useRefreshPromptMetadata({ value, document, commit, project, origin })

  return (
    <DocumentValueContext.Provider
      value={{
        value,
        setValue: setContentValue,
        updateDocumentContent,
        isSaved: !isUpdatingContent,
      }}
    >
      {children}
    </DocumentValueContext.Provider>
  )
}

export function useDocumentValue() {
  const context = useContext(DocumentValueContext)
  if (context === undefined) {
    throw new Error(
      'useDocumentValue must be used within a DocumentValueProvider',
    )
  }

  return context
}

function useSyncLatteChanges({
  document,
  commit,
  project,
  updateContent,
  newLatte,
}: {
  document: DocumentVersion
  commit: Commit
  project: Project
  updateContent: updateContentFn
  newLatte: boolean
}) {
  const router = useNavigate()
  useEvents(
    {
      onLatteProjectChanges: ({ changes }) => {
        const updatedDocument = changes.find(
          (change) =>
            change.draftUuid === commit.uuid &&
            change.current.documentUuid === document.documentUuid,
        )?.current
        if (!updatedDocument) return

        if (updatedDocument.deletedAt) {
          const base = ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
          router.push(newLatte ? base.preview.root : base.overview.root)
          return
        }

        if (updatedDocument.content !== document.content) {
          updateContent(updatedDocument.content, { origin: 'latteCopilot' })
        }
      },
    },
    [document.documentUuid, document.commitId],
  )
}

export function useRefreshPromptMetadata({
  value,
  document,
  commit,
  project,
  origin,
}: {
  value: string
  document: DocumentVersion
  commit: Commit
  project: Project
  origin?: string
}) {
  const { updateMetadata } = useMetadata()
  const { devMode } = useDevMode()
  const { data: integrations } = useIntegrations()
  const { data: providers } = useProviderApiKeys()
  const { data: documents } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const { data: agentToolsMap } = useAgentToolsMap({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  useEffect(() => {
    devMode // Note: This is a hack to force the metadata to be updated when the dev mode is switched
    updateMetadata({
      prompt: value,
      documents,
      document,
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
      agentToolsMap,
      providerNames: providers.map((p) => p.name) ?? [],
      integrationNames: integrations?.map((i) => i.name) ?? [],
      origin,
    })
  }, [
    document.promptlVersion,
    agentToolsMap,
    providers,
    integrations,
    document,
    documents,
    updateMetadata,
    value,
    origin,
    devMode,
  ])
}
