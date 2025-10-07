'use client'

import { useDevMode } from '$/hooks/useDevMode'
import { useMetadata } from '$/hooks/useMetadata'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useDebouncedCallback } from 'use-debounce'
import type { ReadMetadataWorkerProps } from '../workers/readMetadata'
import {
  Commit,
  DocumentVersion,
  Project,
} from '@latitude-data/core/schema/types'

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
  document: _document,
}: DocumentValueProviderProps) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { devMode } = useDevMode()
  const { toast } = useToast()
  const [origin, setOrigin] = useState<string>()
  const {
    data: documents,
    updateContent,
    isUpdatingContent,
  } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const document = useMemo(
    () => documents.find((d) => d.documentUuid === _document.documentUuid),
    [documents, _document.documentUuid],
  )
  const [value, setValue] = useState(document?.content ?? _document.content)
  const setContentValue = useCallback(
    (content: string, opts?: Parameters<updateContentFn>[1]) => {
      setValue(content)
      setOrigin(opts?.origin)
    },
    [setValue, setOrigin],
  )
  const _updateDocumentContent = useCallback(
    async (content: string, opts?: Parameters<updateContentFn>[1]) => {
      const prevContent = document?.content ?? ''

      setContentValue(content, opts)

      const [_, error] = await updateContent({
        commitUuid: commit.uuid,
        projectId: project.id,
        documentUuid: _document.documentUuid,
        content,
      })

      if (error) {
        toast({
          title: 'Error saving document',
          description: 'There was an error saving the document.',
          variant: 'destructive',
        })

        setContentValue(prevContent)
      }
    },
    [
      setContentValue,
      updateContent,
      document,
      _document.documentUuid,
      commit.uuid,
      project.id,
      toast,
    ],
  )
  const updateDocumentContent = useDebouncedCallback(
    _updateDocumentContent,
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
  document?: DocumentVersion
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
    if (!document) return

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
    agentToolsMap,
    devMode,
    document,
    documents,
    integrations,
    origin,
    providers,
    updateMetadata,
    value,
  ])
}
