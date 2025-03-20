'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { createDraftWithContentAction } from '$/actions/commits/createDraftWithContentAction'
import { requestSuggestionAction } from '$/actions/copilot/requestSuggestion'
import { publishEventAction } from '$/actions/events/publishEventAction'
import EditorHeader from '$/components/EditorHeader'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useMetadata } from '$/hooks/useMetadata'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  Commit,
  DatasetVersion,
  DocumentVersion,
  EvaluationDto,
  EvaluationResult,
  ProviderApiKey,
} from '@latitude-data/core/browser'
import {
  Button,
  ClickToCopyUuid,
  DocumentTextEditor,
  SplitPane,
  Text,
  TextEditorPlaceholder,
  Tooltip,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useRouter } from 'next/navigation'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useDebouncedCallback } from 'use-debounce'

import Link from 'next/link'
import { DocumentSuggestions } from './DocumentSuggestions'
import Playground from './Playground'
import RefineDocumentModal from './RefineModal'
import { UpdateToPromptLButton } from './UpdateToPromptl'
import { RefinementHook, useRefinement } from './useRefinement'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useIntegrations from '$/stores/integrations'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

function RefineButton({
  refinement,
  document,
  copilotEnabled,
}: {
  refinement: RefinementHook
  document: DocumentVersion
  copilotEnabled: boolean
}) {
  if (!copilotEnabled) return null

  const RefinementButton = (
    <Button
      disabled={document.promptlVersion === 0}
      className='bg-background'
      variant='outline'
      size='small'
      iconProps={{
        name: 'sparkles',
        size: 'small',
      }}
      onClick={refinement.modal.onOpen}
    >
      <Text.H6>Refine</Text.H6>
    </Button>
  )

  if (document.promptlVersion === 0) {
    return (
      <Tooltip trigger={RefinementButton} asChild>
        Upgrade the syntax of the document to use the Refine feature.
      </Tooltip>
    )
  }

  return <>{RefinementButton}</>
}

export default function DocumentEditor({
  document: _document,
  documents: _documents,
  providerApiKeys,
  freeRunsCount,
  evaluation: serverEvaluation,
  evaluationResults: serverEvaluationResults,
  copilotEnabled,
}: {
  document: DocumentVersion
  documents: DocumentVersion[]
  providerApiKeys?: ProviderApiKey[]
  freeRunsCount?: number
  evaluation: EvaluationDto | undefined
  evaluationResults: EvaluationResult[]
  copilotEnabled: boolean
}) {
  const { execute: publishEvent } = useLatitudeAction(publishEventAction)
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const router = useRouter()
  const refinement = useRefinement({
    projectId: project.id,
    commitUuid: commit.uuid,
    document: _document,
    serverEvaluation,
    serverEvaluationResults,
  })
  const { execute: createDraftWithContent } = useLatitudeAction(
    createDraftWithContentAction,
    {
      onSuccess: ({ data: draft }: { data: Commit }) => {
        router.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: draft.uuid })
            .documents.detail({ uuid: _document.documentUuid }).root,
        )
      },
    },
  )
  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const { data: integrations } = useIntegrations()
  const { data: documents, updateContent } = useDocumentVersions(
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
    [documents],
  )

  const [value, setValue] = useState(_document.content)
  const [isSaved, setIsSaved] = useState(true)

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
            documentUuid: _document.documentUuid,
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

  const { enabled: hasDatasetsV2 } = useFeatureFlag({
    featureFlag: 'datasetsV2',
  })
  const datasetVersion = hasDatasetsV2 ? DatasetVersion.V2 : DatasetVersion.V1

  const { onMetadataProcessed } = useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
    datasetVersion,
  })
  const { metadata, runReadMetadata } = useMetadata({
    onMetadataProcessed: onMetadataProcessed,
  })
  const { data: agentToolsMap } = useAgentToolsMap({
    projectId: project.id,
    commitUuid: commit.uuid,
  })

  useEffect(() => {
    runReadMetadata({
      prompt: value,
      documents,
      document,
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
      agentToolsMap,
      providerNames: providers.map((p) => p.name) ?? [],
      integrationNames: integrations?.map((i) => i.name) ?? [],
    })
  }, [document.promptlVersion, agentToolsMap, providers, integrations])

  console.log('TOP_METADATA', metadata)

  const onChange = useCallback(
    (newValue: string) => {
      setIsSaved(false)
      setValue(newValue)
      debouncedSave(newValue)
      runReadMetadata({
        prompt: newValue,
        documents,
        document,
        fullPath: document.path,
        promptlVersion: document.promptlVersion,
        agentToolsMap,
        providerNames: providers.map((p) => p.name) ?? [],
        integrationNames: integrations?.map((i) => i.name) ?? [],
      })
    },
    [
      runReadMetadata,
      document.path,
      document.promptlVersion,
      agentToolsMap,
      providers,
      integrations,
    ],
  )

  const {
    execute: executeRequestSuggestionAction,
    isPending: isCopilotLoading,
  } = useLatitudeAction(requestSuggestionAction, {
    onSuccess: ({
      data: suggestion,
    }: {
      data: { code: string; response: string } | null
    }) => {
      if (!suggestion) return

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

  const name = document.path.split('/').pop() ?? document.path

  return (
    <>
      {refinement.modal.open ? (
        <RefineDocumentModal
          onClose={refinement.modal.onClose}
          serverEvaluation={refinement.server.evaluation}
          serverEvaluationResults={refinement.server.evaluationResults}
          documentVersion={document}
          setDocumentContent={handleSuggestion}
        />
      ) : null}
      <SplitPane
        className='p-6'
        direction='horizontal'
        gap={4}
        initialPercentage={52}
        minSize={300}
        firstPane={
          <SplitPane.Pane>
            <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
              <EditorHeader
                providers={providers}
                disabledMetadataSelectors={isMerged}
                title={name.length > 30 ? name.slice(0, 30) + '...' : name}
                rightActions={
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
                }
                leftActions={
                  <ClickToCopyUuid
                    tooltipContent='Click to copy the prompt UUID'
                    uuid={document.documentUuid}
                  />
                }
                metadata={metadata}
                prompt={value}
                onChangePrompt={onChange}
                freeRunsCount={freeRunsCount}
                showCopilotSetting={copilotEnabled}
              />
              <Suspense fallback={<TextEditorPlaceholder />}>
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
                    <>
                      <DocumentSuggestions
                        project={project}
                        commit={commit}
                        document={document}
                        prompt={value}
                        setDiff={setDiff}
                        setPrompt={onChange}
                      />
                      <RefineButton
                        refinement={refinement}
                        document={document}
                        copilotEnabled={copilotEnabled}
                      />
                    </>
                  }
                  copilot={
                    copilotEnabled
                      ? {
                          isLoading: isCopilotLoading,
                          requestSuggestion,
                          disabledMessage:
                            document.promptlVersion === 0
                              ? 'Copilot is disabled for prompts using the old syntax. Upgrade to use Copilot.'
                              : undefined,
                        }
                      : undefined
                  }
                />
              </Suspense>
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <div className='flex-1 relative max-h-full'>
              <Playground
                document={document}
                prompt={value}
                setPrompt={onChange}
                metadata={metadata!}
                datasetVersion={datasetVersion}
              />
            </div>
          </SplitPane.Pane>
        }
      />
    </>
  )
}
