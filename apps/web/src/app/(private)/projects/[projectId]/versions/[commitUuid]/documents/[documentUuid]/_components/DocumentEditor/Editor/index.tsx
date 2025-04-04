'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { createDraftWithContentAction } from '$/actions/commits/createDraftWithContentAction'
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
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useRouter } from 'next/navigation'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useDebouncedCallback } from 'use-debounce'

import Link from 'next/link'
import Playground from './Playground'
import RefineDocumentModal from './RefineModal'
import { UpdateToPromptLButton } from './UpdateToPromptl'
import { useRefinement } from './useRefinement'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import useIntegrations from '$/stores/integrations'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { PlaygroundTextEditor } from './TextEditor'

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

  const { metadata, runReadMetadata } = useMetadata()
  useDocumentParameters({
    commitVersionUuid: commit.uuid,
    document,
    datasetVersion,
    metadata,
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
        className='pt-6'
        direction='horizontal'
        gap={4}
        initialPercentage={52}
        initialWidthClass='min-w-1/2'
        minSize={300}
        firstPane={
          <SplitPane.Pane>
            <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0 pl-6 pb-6'>
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
              <PlaygroundTextEditor
                refinement={refinement}
                compileErrors={metadata?.errors}
                project={project}
                document={document}
                commit={commit}
                setDiff={setDiff}
                diff={diff}
                value={value}
                copilotEnabled={copilotEnabled}
                isMerged={isMerged}
                isSaved={isSaved}
                onChange={onChange}
              />
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <div className='flex-1 relative max-h-full pr-6'>
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
