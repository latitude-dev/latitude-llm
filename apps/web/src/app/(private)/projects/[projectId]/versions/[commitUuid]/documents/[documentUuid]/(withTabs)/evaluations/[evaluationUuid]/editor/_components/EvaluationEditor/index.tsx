'use client'

import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { MetadataProvider } from '$/components/MetadataProvider'
import { DevModeProvider } from '$/hooks/useDevMode'
import { useIsLatitudeProvider } from '$/hooks/useIsLatitudeProvider'
import { useMetadata } from '$/hooks/useMetadata'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { EvaluationTitle } from '../../../../_components/EvaluationTitle'
import { EvaluationEditorHeader } from './EditorHeader'
import { useEvaluationParameters } from './hooks/useEvaluationParameters'
import { Playground } from './Playground'
import { TextEditor } from './TextEditor'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import {
  EvaluationType,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/constants'

const ALLOWED_PARAMETERS =
  LLM_EVALUATION_PROMPT_PARAMETERS as unknown as string[]

export function EvaluationEditor(props: {
  document: DocumentVersion
  commit: Commit
  providerApiKeys: ProviderApiKey[]
  copilotEnabled: boolean
  freeRunsCount?: number
  selectedSpanId?: string
  selectedDocumentLogUuid?: string
}) {
  return (
    <MetadataProvider>
      <DevModeProvider>
        <EvaluationEditorContent {...props} />
      </DevModeProvider>
    </MetadataProvider>
  )
}

function EvaluationEditorContent({
  document,
  commit,
  providerApiKeys,
  freeRunsCount,
  copilotEnabled,
  selectedSpanId,
  selectedDocumentLogUuid,
}: {
  document: DocumentVersion
  commit: Commit
  providerApiKeys: ProviderApiKey[]
  copilotEnabled: boolean
  freeRunsCount?: number
  selectedSpanId?: string
  selectedDocumentLogUuid?: string
}) {
  const { project } = useCurrentProject()
  const { evaluation } = useCurrentEvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetricAnyCustom
  >()
  const { updateEvaluation, isUpdatingEvaluation } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
    notifyUpdate: false,
  })
  const { data: providers } = useProviderApiKeys({
    fallbackData: providerApiKeys,
  })
  const originalPrompt = evaluation.configuration.prompt
  const [value, setValue] = useState(originalPrompt)
  const providerNames = useMemo(() => providers.map((p) => p.name), [providers])
  const { data: integrations } = useIntegrations({ withTools: true })
  const integrationNames = useMemo(
    () => integrations?.map((i) => i.name) ?? [],
    [integrations],
  )
  const buildPromptMetadata = useCallback(
    ({ promptValue }: { promptValue: string }) => {
      return {
        prompt: promptValue,
        editorType: 'code' as const,
        promptlVersion: 1,
        providerNames,
        integrationNames,
        withParameters: ALLOWED_PARAMETERS,
        requireConfiguration: true,
        noOutputSchemaConfig: {
          message:
            'The evaluation output schema is system-managed and cannot be modified manually.',
        },
      }
    },
    [providerNames, integrationNames],
  )
  const debouncedSave = useDebouncedCallback(
    async (val: string) => {
      await updateEvaluation({
        documentUuid: evaluation.documentUuid,
        evaluationUuid: evaluation.uuid,
        settings: {
          configuration: {
            ...evaluation.configuration,
            prompt: val,
          },
        },
      })

      const metadataProps = buildPromptMetadata({ promptValue: val })
      runReadMetadata(metadataProps)
    },
    500,
    { leading: false, trailing: true },
  )
  const onChange = useCallback(
    (newPrompt: string) => {
      setValue(newPrompt)

      debouncedSave(newPrompt)
    },
    [debouncedSave, setValue],
  )

  const { metadata, updateMetadata: runReadMetadata } = useMetadata()
  useEvaluationParameters({
    commitVersionUuid: commit.uuid,
    document,
    evaluation,
    metadata,
  })
  const isLatitudeProvider = useIsLatitudeProvider({ metadata })

  useEffect(() => {
    const metadataProps = buildPromptMetadata({ promptValue: value })
    runReadMetadata(metadataProps)
  }, [value, buildPromptMetadata, runReadMetadata])

  const backHref = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid })
    .evaluations.detail({ uuid: evaluation.uuid }).root
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
              <EvaluationEditorHeader
                canUseSubagents={false}
                providers={providers}
                disabledMetadataSelectors={commit.mergedAt !== null}
                titleVerticalAlign='top'
                title={
                  <EvaluationTitle
                    evaluation={evaluation}
                    backHref={backHref}
                    subSection='Editor'
                  />
                }
                metadata={metadata}
                prompt={originalPrompt}
                onChangePrompt={onChange}
                isLatitudeProvider={isLatitudeProvider}
                freeRunsCount={freeRunsCount}
              />
              <TextEditor
                compileErrors={metadata?.errors}
                defaultValue={originalPrompt}
                value={value}
                isMerged={commit.mergedAt !== null}
                isSaved={!isUpdatingEvaluation}
                copilotEnabled={copilotEnabled}
                onChange={onChange}
              />
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <div className='flex-1 relative max-h-full px-4'>
              <Playground
                commit={commit}
                document={document}
                evaluation={evaluation}
                metadata={metadata!}
                selectedSpanId={selectedSpanId}
                selectedDocumentLogUuid={selectedDocumentLogUuid}
              />
            </div>
          </SplitPane.Pane>
        }
      />
    </>
  )
}
