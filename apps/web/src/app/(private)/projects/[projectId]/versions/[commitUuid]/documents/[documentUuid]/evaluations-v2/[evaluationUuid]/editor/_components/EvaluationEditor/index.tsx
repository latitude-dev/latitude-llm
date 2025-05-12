'use client'

import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EditorHeader } from '$/components/EditorHeader'
import { useMetadata } from '$/hooks/useMetadata'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  Commit,
  DocumentVersion,
  EvaluationType,
  LLM_EVALUATION_PROMPT_PARAMETERS,
  LlmEvaluationMetricAnyCustom,
  ProviderApiKey,
} from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

import { ROUTES } from '$/services/routes'
import useIntegrations from '$/stores/integrations'
import { EvaluationTitle } from '../../../../_components/EvaluationTitle'
import { Playground } from './Playground'
import { TextEditor } from './TextEditor'
import { useEvaluationParameters } from './hooks/useEvaluationParamaters'

const ALLOWED_PARAMETERS =
  LLM_EVALUATION_PROMPT_PARAMETERS as unknown as string[]
export function EvaluationEditor({
  document,
  commit,
  providerApiKeys,
  freeRunsCount,
  copilotEnabled,
  selectedDocumentLogUuid,
}: {
  document: DocumentVersion
  commit: Commit
  providerApiKeys: ProviderApiKey[]
  copilotEnabled: boolean
  freeRunsCount?: number
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
  const { data: integrations } = useIntegrations()
  const integrationNames = useMemo(
    () => integrations?.map((i) => i.name) ?? [],
    [integrations],
  )
  const buildPromptMetadata = useCallback(
    ({ promptValue }: { promptValue: string }) => {
      return {
        prompt: promptValue,
        promptlVersion: 1,
        providerNames,
        integrationNames,
        withParameters: ALLOWED_PARAMETERS,
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

  const { metadata, runReadMetadata } = useMetadata()
  useEvaluationParameters({
    commitVersionUuid: commit.uuid,
    document,
    evaluation,
    metadata,
  })

  useEffect(() => {
    const metadataProps = buildPromptMetadata({ promptValue: value })
    runReadMetadata(metadataProps)
  }, [value, buildPromptMetadata, runReadMetadata])

  const backHref = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid })
    .evaluationsV2.detail({ uuid: evaluation.uuid }).root
  return (
    <>
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
                freeRunsCount={freeRunsCount}
                showCopilotSetting={copilotEnabled}
              />
              <TextEditor
                compileErrors={metadata?.errors}
                defaultValue={originalPrompt}
                value={value}
                isMerged={commit.mergedAt !== null}
                isSaved={!isUpdatingEvaluation}
                onChange={onChange}
              />
            </div>
          </SplitPane.Pane>
        }
        secondPane={
          <SplitPane.Pane>
            <div className='flex-1 relative max-h-full pr-6'>
              <Playground
                commit={commit}
                document={document}
                evaluation={evaluation}
                metadata={metadata!}
                selectedDocumentLogUuid={selectedDocumentLogUuid}
              />
            </div>
          </SplitPane.Pane>
        }
      />
    </>
  )
}
