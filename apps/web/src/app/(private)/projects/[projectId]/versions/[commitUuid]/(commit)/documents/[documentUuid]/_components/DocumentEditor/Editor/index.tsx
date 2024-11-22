'use client'

import React, {
  createContext,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  Commit,
  DocumentVersion,
  ProviderApiKey,
} from '@latitude-data/core/browser'
import {
  Button,
  DocumentTextEditor,
  DocumentTextEditorFallback,
  SplitPane,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { createDraftWithContentAction } from '$/actions/commits/createDraftWithContentAction'
import { requestSuggestionAction } from '$/actions/copilot/requestSuggestion'
import { publishEventAction } from '$/actions/events/publishEventAction'
import { type AddMessagesActionFn } from '$/actions/sdk/addMessagesAction'
import type { RunDocumentActionFn } from '$/actions/sdk/runDocumentAction'
import EditorHeader from '$/components/EditorHeader'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useMetadata } from '$/hooks/useMetadata'
import { ROUTES } from '$/services/routes'
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
  const { execute: publishEvent } = useLatitudeAction(publishEventAction)
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
        publishEvent({
          eventType: 'copilotRefinerApplied',
          payload: {
            projectId: project.id,
            commitUuid: commit.uuid,
            documentUuid: document.documentUuid,
          },
        })

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
    [
      document.documentUuid,
      document.path,
      commit.mergedAt,
      publishEvent,
      project.id,
      commit.uuid,
    ],
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

  const { onMetadataProcessed } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    documentVersionUuid: document.documentUuid,
  })
  const { metadata, runReadMetadata } = useMetadata({
    onMetadataProcessed: onMetadataProcessed,
  })

  useEffect(() => {
    runReadMetadata({
      prompt: value,
      documents: _documents,
      document,
      fullPath: document.path,
    })
  }, [])

  const onChange = useCallback(
    (newValue: string) => {
      setIsSaved(false)
      setValue(newValue)
      debouncedSave(newValue)
      runReadMetadata({
        prompt: newValue,
        documents: _documents,
        document,
        fullPath: document.path,
      })
    },
    [runReadMetadata, document.path],
  )

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
          publishEvent({
            eventType: 'copilotSuggestionApplied',
            payload: {
              projectId: project.id,
              commitUuid: commit.uuid,
              documentUuid: document.documentUuid,
            },
          })
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
        <SplitPane
          className='p-6'
          initialPercentage={55}
          minWidth={300}
          leftPane={
            <SplitPane.Pane>
              <div className='pr-4 flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
                <EditorHeader
                  providers={providers}
                  disabledMetadataSelectors={isMerged}
                  title='Prompt editor'
                  metadata={metadata}
                  prompt={value}
                  onChangePrompt={onChange}
                  freeRunsCount={freeRunsCount}
                  showCopilotSetting
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
                    copilot={{
                      isLoading: isCopilotLoading,
                      requestSuggestion,
                    }}
                  />
                </Suspense>
              </div>
            </SplitPane.Pane>
          }
          rightPane={
            <SplitPane.Pane>
              <div className='pl-4 flex-1 relative max-h-full'>
                <Playground document={document} metadata={metadata!} />
              </div>
            </SplitPane.Pane>
          }
        />
      </DocumentEditorContext.Provider>
    </>
  )
}
