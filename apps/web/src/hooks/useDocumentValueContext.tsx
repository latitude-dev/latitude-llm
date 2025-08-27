'use client'

import { useLatteChangeActions } from '$/hooks/latte'
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
import type { DiffOptions } from '@latitude-data/web-ui/molecules/DocumentTextEditor/types'
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
  useMemo,
  useRef,
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
  document: DocumentVersion
  isSaved: boolean
  diff: DiffOptions | undefined
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
  documents: _documents,
}: DocumentValueProviderProps) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { devMode, setDevMode } = useDevMode()
  const { data: documents } = useDocumentVersions(
    {
      commitUuid: commit.uuid,
      projectId: project.id,
    },
    {
      fallbackData: _documents,
      keepPreviousData: true,
      revalidateOnMount: true,
    },
  )
  const document = useMemo(
    () =>
      documents?.find((d) => d.documentUuid === _document.documentUuid) ??
      _document,
    [documents, _document],
  )

  const [value, setValue] = useState(document.content)
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

  const { diff } = useSyncLatteChanges({
    content: value,
    updateContent: setContentValue,
    document: document,
    commit: commit,
    project: project,
    devMode: devMode,
    setDevMode: setDevMode,
    newLatte: newLatte,
  })
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
        setValue: setContentValue,
        updateDocumentContent,
        isSaved: !isUpdatingContent,
        document,
        diff,
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
  content,
  updateContent,
  document,
  commit,
  project,
  devMode,
  setDevMode,
  newLatte,
}: {
  content: string
  updateContent: updateContentFn
  document: DocumentVersion
  commit: Commit
  project: Project
  devMode: boolean
  setDevMode: (devMode: boolean) => void
  newLatte: boolean
}) {
  const router = useNavigate()

  const [diff, setDiff] = useState<DiffOptions>()
  const { changes } = useLatteChangeActions()
  const change = useMemo(() => {
    const change = changes.find(
      (change) =>
        change.draftUuid === commit.uuid &&
        change.current.documentUuid === document.documentUuid,
    )

    if (!change) {
      return undefined
    }

    if (change.current.deletedAt) {
      return undefined
    }

    if (change.previous?.content === content) {
      return undefined
    }

    return change
  }, [content, changes, commit, document])
  useEffect(() => {
    if (!change) {
      setDiff(undefined)
    } else {
      setDiff({
        oldValue: change.previous?.content ?? '',
        newValue: content,
      })
    }
  }, [content, change, setDiff])

  const simpleMode = useRef<boolean>()
  const goToDevEditor = useCallback(() => {
    if (devMode) return
    simpleMode.current = true
    setDevMode(true)
  }, [devMode, setDevMode])
  const backToPrevEditor = useCallback(() => {
    if (!simpleMode.current) return
    simpleMode.current = false
    setDevMode(false)
  }, [setDevMode])

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
          goToDevEditor()
        }
      },
      onLatteChangesAccepted: () => backToPrevEditor(),
      onLatteChangesRejected: () => backToPrevEditor(),
    },
    [document.documentUuid, document.commitId],
  )

  return { diff }
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
