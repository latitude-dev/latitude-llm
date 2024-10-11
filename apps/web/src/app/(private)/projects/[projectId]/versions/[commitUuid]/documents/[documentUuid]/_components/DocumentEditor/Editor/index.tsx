'use client'

import path from 'path'
import React, {
  createContext,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from 'react'

import { Document as RefDocument } from '@latitude-data/compiler'
import {
  Commit,
  DocumentVersion,
  promptConfigSchema,
  ProviderApiKey,
} from '@latitude-data/core/browser'
import {
  Button,
  DocumentTextEditor,
  DocumentTextEditorFallback,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { createDraftWithContentAction } from '$/actions/commits/createDraftWithContentAction'
import { requestSuggestionAction } from '$/actions/copilot/requestSuggestion'
import { type AddMessagesActionFn } from '$/actions/sdk/addMessagesAction'
import type { RunDocumentActionFn } from '$/actions/sdk/runDocumentAction'
import EditorHeader from '$/components/EditorHeader'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useMetadata } from '$/hooks/useMetadata'
import { ROUTES } from '$/services/routes'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import useDocumentVersions from '$/stores/documentVersions'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { useRouter } from 'next/navigation'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useDebouncedCallback } from 'use-debounce'

import Playground from './Playground'
import RefineDocumentModal from './RefineModal'

export const DocumentEditorContext = createContext<
  | {
      runDocumentAction: RunDocumentActionFn
      addMessagesAction: AddMessagesActionFn
    }
  | undefined
>(undefined)

export default function DocumentEditor({
  runDocumentAction,
  addMessagesAction,
  document,
  documents,
  providerApiKeys,
  freeRunsCount,
}: {
  runDocumentAction: Function
  addMessagesAction: Function
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
}) {
  const { data: workspace } = useCurrentWorkspace()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const router = useRouter()
  const { execute: createDraftWithContent } = useLatitudeAction(
    createDraftWithContentAction,
    {
      onSuccess: ({ data: draft }: { data: Commit }) => {
        router.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: draft.uuid })
            .documents.detail({ uuid: document.documentUuid }).root,
        )
      },
    },
  )
  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const { data: _documents, updateContent } = useDocumentVersions(
    {
      commitUuid: commit.uuid,
      projectId: project.id,
    },
    {
      fallbackData: documents,
    },
  )
  const [value, setValue] = useState(document.content)
  const [isSaved, setIsSaved] = useState(true)
  const [refineDocumentModalOpen, setRefineDocumentModalOpen] = useState(false)

  const [diff, setDiff] = useState<DiffOptions>()
  const handleSuggestion = useCallback(
    (suggestion: string) => {
      const onAccept = (newValue: string) => {
        setDiff(undefined)
        if (!commit.mergedAt) {
          onChange(newValue)
          return
        }

        createDraftWithContent({
          title: `Refined '${document.path.split('/').pop()}'`,
          content: newValue,
          documentUuid: document.documentUuid,
          projectId: project.id,
        })
      }

      setDiff({
        newValue: suggestion,
        description: 'Generated suggestion',
        onAccept,
        onReject: () => {
          setDiff(undefined)
        },
      })
    },
    [document.documentUuid, document.path, commit.mergedAt],
  )

  const debouncedSave = useDebouncedCallback(
    (val: string) => {
      updateContent({
        commitUuid: commit.uuid,
        projectId: project.id,
        documentUuid: document.documentUuid,
        content: val,
      })

      setIsSaved(true)
    },
    500,
    { trailing: true },
  )

  const onChange = useCallback((value: string) => {
    setIsSaved(false)
    setValue(value)
    debouncedSave(value)
  }, [])

  const readDocumentContent = useCallback(
    async (path: string) => {
      return _documents.find((d) => d.path === path)?.content
    },
    [_documents],
  )

  const readDocument = useCallback(
    async (
      refPath: string,
      from?: string,
    ): Promise<RefDocument | undefined> => {
      const fullPath = path
        .resolve(path.dirname(`/${from ?? ''}`), refPath)
        .replace(/^\//, '')

      if (fullPath === document.path) {
        return {
          path: fullPath,
          content: value,
        }
      }

      const content = await readDocumentContent(fullPath)
      if (content === undefined) return undefined

      return {
        path: fullPath,
        content,
      }
    },
    [readDocumentContent, value],
  )

  const configSchema = useMemo(
    () => promptConfigSchema({ providers }),
    [providers],
  )

  const { metadata } = useMetadata({
    prompt: value,
    fullPath: document.path,
    referenceFn: readDocument,
    configSchema,
  })

  const {
    execute: executeRequestSuggestionAction,
    isPending: isCopilotLoading,
  } = useLatitudeAction(requestSuggestionAction, {
    onSuccess: ({
      data: suggestion,
    }: {
      data: { code: string; response: string }
    }) => {
      setDiff({
        newValue: suggestion.code,
        description: suggestion.response,
        onAccept: (newValue: string) => {
          setDiff(undefined)
          onChange(newValue)
        },
        onReject: () => {
          setDiff(undefined)
        },
      })
    },
  })
  const requestSuggestion = useCallback(
    (prompt: string) => {
      executeRequestSuggestionAction({
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        request: prompt,
      })
    },
    [executeRequestSuggestionAction],
  )

  const isMerged = commit.mergedAt !== null
  return (
    <>
      <RefineDocumentModal
        open={refineDocumentModalOpen}
        onOpenChange={setRefineDocumentModalOpen}
        documentVersion={document}
        setDocumentContent={handleSuggestion}
      />
      <DocumentEditorContext.Provider
        value={{
          runDocumentAction: runDocumentAction as RunDocumentActionFn,
          addMessagesAction: addMessagesAction as AddMessagesActionFn,
        }}
      >
        <div className='flex flex-row w-full h-full gap-8 p-6'>
          <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
            <EditorHeader
              providers={providers}
              disabledMetadataSelectors={isMerged}
              title='Prompt editor'
              metadata={metadata}
              prompt={value}
              onChangePrompt={onChange}
              freeRunsCount={freeRunsCount}
              showCopilotSetting={workspace.id == 1} // Primitive feature flag
            />
            <Suspense fallback={<DocumentTextEditorFallback />}>
              <DocumentTextEditor
                value={value}
                metadata={metadata}
                onChange={onChange}
                diff={diff}
                readOnlyMessage={
                  isMerged ? 'Create a draft to edit documents.' : undefined
                }
                isSaved={isSaved}
                actionButtons={
                  <Button
                    className='bg-background'
                    variant='outline'
                    size='small'
                    iconProps={{
                      name: 'sparkles',
                      size: 'small',
                    }}
                    onClick={() => setRefineDocumentModalOpen(true)}
                  >
                    <Text.H6>Refine</Text.H6>
                  </Button>
                }
                copilot={
                  workspace.id == 1 // Primitive feature flag, tmp
                    ? {
                        isLoading: isCopilotLoading,
                        requestSuggestion,
                      }
                    : undefined
                }
              />
            </Suspense>
          </div>
          <div className='flex flex-col flex-1 gap-2 overflow-y-auto custom-scrollbar max-h-[calc(100vh-170px)]'>
            <Playground document={document} metadata={metadata!} />
          </div>
        </div>
      </DocumentEditorContext.Provider>
    </>
  )
}
