'use client'

import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { useNavigate } from '$/hooks/useNavigate'
import { useEvents } from '$/lib/events'
import { ROUTES } from '$/services/routes'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useDocumentVersions from '$/stores/documentVersions'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { DocumentVersion, ProviderApiKey } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { type DiffOptions } from '@latitude-data/web-ui/molecules/DocumentTextEditor/types'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import {
  ICommitContextType,
  IProjectContextType,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { EditorHeader as EvaluationEditorHeader } from '../../../evaluations/[evaluationUuid]/editor/_components/EvaluationEditor/EditorHeader'
import { PlaygroundBlocksEditor } from './BlocksEditor'
import { EditorHeader } from './EditorHeader'
import { Playground } from './Playground'
import { PlaygroundTextEditor } from './TextEditor'
import { UpdateToPromptLButton } from './UpdateToPromptl'
import { useLatteStreaming } from './useLatteStreaming'

/**
 * DEPRECATED: This will be not needed once new editor header
 * is fully implemented.
 */
function useOldEditorHeaderActions({
  project,
  commit,
  document,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
}) {
  return useMemo(() => {
    return {
      leftActions: (
        <ClickToCopyUuid
          tooltipContent='Click to copy the prompt UUID'
          uuid={document.documentUuid}
        />
      ),
      rightActions: (
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
    }
  }, [project.id, commit.uuid, document])
}

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

  const { value: devMode, setValue: setDevMode } = useLocalStorage({
    key: AppLocalStorage.devMode,
    defaultValue: true,
  })

  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const router = useNavigate()

  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const { data: integrations } = useIntegrations({ withTools: true })
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
  const oldHeaderEditorActions = useOldEditorHeaderActions({
    project: useCurrentProject().project,
    commit: useCurrentCommit().commit,
    document,
  })
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
      onLatteProjectChanges: ({ changes, simulateStreaming }) => {
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
          editorType: devMode ? 'visual' : 'code',
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
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })
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
      editorType: devMode ? 'code' : 'visual',
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
    devMode,
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
        visibleHandle={false}
        className='pt-6'
        direction='horizontal'
        reversed
        initialWidthClass='min-w-1/2'
        minSize={350}
        initialPercentage={50}
        firstPane={
          <SplitPane.Pane>
            <div className='flex flex-col flex-1 flex-grow flex-shrink gap-y-4 min-w-0 min-h-0 pl-6 pr-4 pb-6'>
              {blocksEditorEnabled ? (
                <EditorHeader
                  title={name}
                  prompt={value}
                  providers={providers}
                  metadata={metadata}
                  onChangePrompt={onChange}
                  isLatitudeProvider={isLatitudeProvider}
                  isMerged={isMerged}
                  freeRunsCount={freeRunsCount}
                  devMode={devMode}
                  setDevMode={setDevMode}
                />
              ) : (
                <EvaluationEditorHeader
                  documentVersion={document}
                  providers={providers}
                  disabledMetadataSelectors={isMerged}
                  title={name}
                  leftActions={oldHeaderEditorActions.leftActions}
                  rightActions={oldHeaderEditorActions.rightActions}
                  metadata={metadata}
                  prompt={document.content}
                  isLatitudeProvider={isLatitudeProvider}
                  onChangePrompt={onChange}
                  freeRunsCount={freeRunsCount}
                />
              )}
              {devMode ? (
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
              ) : (
                <PlaygroundBlocksEditor
                  project={project}
                  document={document}
                  commit={commit}
                  readOnlyMessage={readOnlyMessage}
                  isSaved={!isUpdatingContent}
                  onToggleBlocksEditor={setDevMode}
                  value={value}
                  rootBlock={metadata?.rootBlock}
                  onChange={onChange}
                  config={metadata?.config}
                  compileErrors={metadata?.errors}
                />
              )}
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <Playground
              document={document}
              prompt={document.content}
              setPrompt={onChange}
              metadata={metadata!}
            />
          </SplitPane.Pane>
        }
      />
    </>
  )
}
