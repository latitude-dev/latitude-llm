'use client'

import { useDevMode } from '$/hooks/useDevMode'
import { useMetadata } from '$/hooks/useMetadata'
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
  isSaved: boolean
  isUpdatingContent: boolean
  updateDocumentContent: updateContentFn
}

const DocumentValueContext = createContext<
  DocumentValueContextType | undefined
>(undefined)

type DocumentValueProviderProps = {
  children: ReactNode
  document: DocumentVersion
  documents?: DocumentVersion[]
}

export function DocumentValueProvider({
  children,
  document,
}: DocumentValueProviderProps) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { devMode } = useDevMode()
  const [value, setValue] = useState(document.content)
  const { toast } = useToast()
  const [origin, setOrigin] = useState<string>()
  const { updateContent, isUpdatingContent } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const setContentValue = useCallback(
    (content: string, opts?: Parameters<updateContentFn>[1]) => {
      setValue(content)
      setOrigin(opts?.origin)
    },
    [setValue, setOrigin],
  )
  const updateDocumentContent = useDebouncedCallback(
    async (content: string, opts?: Parameters<updateContentFn>[1]) => {
      setContentValue(content, opts)

      const [_, error] = await updateContent({
        commitUuid: commit.uuid,
        projectId: project.id,
        documentUuid: document.documentUuid,
        content,
      })
      if (error) {
        toast({
          title: 'Error saving document',
          description: 'There was an error saving the document.',
          variant: 'destructive',
        })
        setContentValue(document.content)
      }
    },
    500,
    { leading: false, trailing: true },
  )

  useRefreshPromptMetadata({
    value: value,
    document: document,
    commit: commit,
    project: project,
    devMode: devMode,
    origin: origin,
  })

  return (
    <DocumentValueContext.Provider
      value={{
        value,
        updateDocumentContent,
        isUpdatingContent,
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

export function useDocumentValueMaybe() {
  const context = useContext(DocumentValueContext)
  return (
    context ?? {
      value: undefined,
      isSaved: false,
      updateDocumentContent: undefined,
    }
  )
}

export function useRefreshPromptMetadata({
  value,
  document,
  commit,
  project,
  devMode,
  origin,
}: {
  value: string
  document: DocumentVersion
  commit: Commit
  project: Project
  devMode: boolean
  origin?: string
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
