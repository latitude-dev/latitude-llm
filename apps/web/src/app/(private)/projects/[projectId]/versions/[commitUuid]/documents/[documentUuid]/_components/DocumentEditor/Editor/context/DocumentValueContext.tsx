'use client'

import { useMetadata } from '$/hooks/useMetadata'
import { useNavigate } from '$/hooks/useNavigate'
import { useEvents } from '$/lib/events'
import { ROUTES } from '$/services/routes'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useDebouncedCallback } from 'use-debounce'

type DocumentValueContextType = {
  value: string
  setValue: (value: string) => void
  updateDocumentContent: (content: string) => void
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
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { updateContent, isUpdatingContent } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const { toast } = useToast()
  const updateDocumentContent = useDebouncedCallback(
    async (content: string) => {
      setValue(content)

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

        setValue(document.content)
      }
    },
    500,
    { leading: false, trailing: true },
  )

  useSyncLatteChanges({ document, setValue, commit, project })
  useRefreshPromptMetadata({ value, document, commit, project })

  return (
    <DocumentValueContext.Provider
      value={{
        value,
        setValue,
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
  setValue,
}: {
  document: DocumentVersion
  commit: Commit
  project: Project
  setValue: (value: string) => void
}) {
  const router = useNavigate()
  useEvents(
    {
      onLatteProjectChanges: ({ changes }) => {
        const updatedDocument = changes.find(
          (change: any) =>
            change.draftUuid === commit.uuid &&
            change.current.documentUuid === document.documentUuid,
        )?.current
        if (!updatedDocument) return

        if (updatedDocument.deletedAt) {
          router.push(
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid }).overview.root,
          )
          return
        }

        if (updatedDocument.content !== document.content) {
          setValue(updatedDocument.content)
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
}: {
  value: string
  document: DocumentVersion
  commit: Commit
  project: Project
}) {
  const { updateMetadata } = useMetadata()
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
    updateMetadata({
      prompt: value,
      documents,
      document,
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
      agentToolsMap,
      providerNames: providers.map((p) => p.name) ?? [],
      integrationNames: integrations?.map((i) => i.name) ?? [],
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
  ])
}
