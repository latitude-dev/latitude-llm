'use client'

import { EditorHeader } from '$/components/EditorHeader'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useMetadata } from '$/hooks/useMetadata'
import { ROUTES } from '$/services/routes'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { DocumentVersion, ProviderApiKey } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { type DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { useEvents } from '$/lib/events'
import { useNavigate } from '$/hooks/useNavigate'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { UpdateToPromptLButton } from './UpdateToPromptl'
import { Playground } from './Playground'
import { useLatteStreaming } from './useLatteStreaming'
import { PlaygroundTextEditor } from './TextEditor'
import { PlaygroundBlocksEditor } from './BlocksEditor'

export default function DocumentEditor({
  document: _document,
  documents: _documents,
  providerApiKeys,
  freeRunsCount,
  copilotEnabled,
  initialDiff,
}: {
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
  copilotEnabled: boolean
  initialDiff?: string
}) {
  const { enabled: blocksEditorEnabled } = useFeatureFlag({
    featureFlag: 'blocksEditor',
  })
  const [showBlocksEditor, setBlockEditorVisible] = useState(false)

  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const router = useNavigate()

  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const { data: integrations } = useIntegrations()
  const {
    data: documents,
    updateContent,
    isUpdatingContent,
  } = useDocumentVersions(
    {
      commitUuid: commit.uuid,
      projectId: project.id,
    },
    {
      fallbackData: _documents,
    },
  )

  const document = useMemo(
    () =>
      documents?.find((d) => d.documentUuid === _document.documentUuid) ??
      _document,
    [documents, _document],
  )

  const [value, setValue] = useState(document.content)
  const {
    customReadOnlyMessage,
    highlightedCursorIndex,
    streamLatteUpdate,
    isStreamingRef,
  } = useLatteStreaming({
    value,
    setValue,
  })

  useEvents(
    {
      onLatteChanges: ({ changes, simulateStreaming }) => {
        const updatedDocument = changes.find(
          (change) =>
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
          if (simulateStreaming) {
            streamLatteUpdate(updatedDocument.content)
          } else {
            setValue(updatedDocument.content)
          }
        }
      },
    },
    [document.documentUuid, document.commitId, streamLatteUpdate],
  )

  const { toast } = useToast()
  const debouncedSave = useDebouncedCallback(
    async (val: string) => {
      const [_, error] = await updateContent({
        commitUuid: commit.uuid,
        projectId: project.id,
        documentUuid: document.documentUuid,
        content: val,
      })

      if (error) {
        toast({
          title: 'Error saving document',
          description: 'There was an error saving the document.',
          variant: 'destructive',
        })

        setValue(document.content)
      } else {
        runReadMetadata({
          prompt: val,
          editorType: showBlocksEditor ? 'visual' : 'code',
          documents,
          document,
          fullPath: document.path,
          promptlVersion: document.promptlVersion,
          agentToolsMap,
          providerNames: providers.map((p) => p.name) ?? [],
          integrationNames: integrations?.map((i) => i.name) ?? [],
        })
      }
    },
    500,
    { leading: false, trailing: true },
  )

  const { metadata, runReadMetadata } = useMetadata()
  useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
    metadata,
  })
  const { data: agentToolsMap } = useAgentToolsMap({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  useEffect(() => {
    runReadMetadata({
      prompt: value,
      editorType: showBlocksEditor ? 'visual' : 'code',
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
    showBlocksEditor,
    documents,
    runReadMetadata,
    value,
  ])

  const isMerged = commit.mergedAt !== null

  const onChange = useCallback(
    async (newValue: string) => {
      if (isStreamingRef.current) return // Prevent updating the actual document while streaming
      if (isMerged) return
      setValue(newValue)
      debouncedSave(newValue)
    },
    [debouncedSave, setValue, isMerged, isStreamingRef],
  )

  const [diff, setDiff] = useState<DiffOptions | undefined>(
    initialDiff
      ? {
          newValue: initialDiff,
          onAccept: (newValue: string) => {
            setDiff(undefined)
            onChange(newValue)

            // Remove applyExperimentId from URL
            if (window?.location) {
              const url = new URL(window.location.href)
              url.searchParams.delete('applyExperimentId')
              window.history.replaceState({}, '', url.toString())
            }
          },
          onReject: () => {
            setDiff(undefined)

            // Remove applyExperimentId from URL
            if (window?.location) {
              const url = new URL(window.location.href)
              url.searchParams.delete('applyExperimentId')
              window.history.replaceState({}, '', url.toString())
            }
          },
        }
      : undefined,
  )

  const name = document.path.split('/').pop() ?? document.path
  const readOnlyMessage = isMerged
    ? 'Create a draft to edit documents.'
    : customReadOnlyMessage

  return (
    <>
      <SplitPane
        className='pt-6'
        direction='horizontal'
        reversed
        initialWidthClass='min-w-1/2'
        minSize={350}
        initialPercentage={40}
        firstPane={
          <SplitPane.Pane>
            <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0 pl-6 pb-6 pr-4'>
              <EditorHeader
                documentVersion={document}
                providers={providers}
                disabledMetadataSelectors={isMerged}
                title={name}
                rightActions={useMemo(
                  () => (
                    <>
                      <Tooltip
                        asChild
                        trigger={
                          <Link
                            href={
                              ROUTES.projects
                                .detail({ id: project.id })
                                .commits.detail({ uuid: commit.uuid })
                                .history.detail({
                                  uuid: document.documentUuid,
                                }).root
                            }
                          >
                            <Button
                              variant='outline'
                              size='small'
                              className='h-7'
                              iconProps={{
                                name: 'history',
                                color: 'foregroundMuted',
                              }}
                            />
                          </Link>
                        }
                      >
                        View prompt history
                      </Tooltip>
                      <UpdateToPromptLButton document={document} />
                    </>
                  ),
                  [project.id, commit.uuid, document],
                )}
                leftActions={useMemo(
                  () => (
                    <ClickToCopyUuid
                      tooltipContent='Click to copy the prompt UUID'
                      uuid={document.documentUuid}
                    />
                  ),
                  [document.documentUuid],
                )}
                metadata={metadata}
                prompt={document.content}
                onChangePrompt={onChange}
                freeRunsCount={freeRunsCount}
                showCopilotSetting={copilotEnabled}
              />
              {blocksEditorEnabled ? (
                <div className='flex flex-row justify-end'>
                  <SwitchInput
                    fullWidth={false}
                    label='Enable Simple editor'
                    defaultChecked={showBlocksEditor}
                    checked={showBlocksEditor}
                    onCheckedChange={setBlockEditorVisible}
                  />
                </div>
              ) : null}
              {showBlocksEditor ? (
                <PlaygroundBlocksEditor
                  project={project}
                  document={document}
                  commit={commit}
                  readOnlyMessage={readOnlyMessage}
                  isSaved={!isUpdatingContent}
                  onToggleBlocksEditor={setBlockEditorVisible}
                  value={value}
                  rootBlock={metadata?.rootBlock}
                  onChange={onChange}
                  compileErrors={metadata?.errors}
                />
              ) : (
                <PlaygroundTextEditor
                  compileErrors={metadata?.errors}
                  project={project}
                  document={document}
                  commit={commit}
                  setDiff={setDiff}
                  diff={diff}
                  value={value}
                  defaultValue={document.content}
                  copilotEnabled={copilotEnabled}
                  readOnlyMessage={readOnlyMessage}
                  isSaved={!isUpdatingContent}
                  onChange={onChange}
                  highlightedCursorIndex={highlightedCursorIndex}
                />
              )}
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <div className='flex-1 relative max-h-full px-4'>
              <Playground
                document={document}
                prompt={document.content}
                setPrompt={onChange}
                metadata={metadata!}
              />
            </div>
          </SplitPane.Pane>
        }
      />
    </>
  )
}
