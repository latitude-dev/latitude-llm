'use client'

import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { EditorHeader } from '$/components/EditorHeader'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useMetadata } from '$/hooks/useMetadata'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  Commit,
  DocumentVersion,
  EvaluationType,
  LlmEvaluationMetric,
  ProviderApiKey,
} from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

import { TextEditor } from './TextEditor'
import { Playground } from './Playground'

export function EvaluationEditor({
  document,
  commit,
  providerApiKeys,
  freeRunsCount,
  copilotEnabled,
}: {
  document: DocumentVersion
  commit: Commit
  providerApiKeys: ProviderApiKey[]
  copilotEnabled: boolean
  freeRunsCount?: number
}) {
  const { project } = useCurrentProject()
  const { evaluation } = useCurrentEvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Custom | LlmEvaluationMetric.CustomLabeled
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
  const [value, setValue] = useState(document.content)
  const { toast } = useToast()
  const providerNames = useMemo(() => providers.map((p) => p.name), [providers])
  const debouncedSave = useDebouncedCallback(
    async (val: string) => {
      const [_, error] = await updateEvaluation({
        evaluationUuid: evaluation.uuid,
        settings: {
          configuration: {
            ...evaluation.configuration,
            prompt: val,
          },
        },
      })

      if (error) {
        toast({
          title: 'Error saving evaluation prompt',
          description: 'There was an error saving the evaluation prompt.',
          variant: 'destructive',
        })

        setValue(document.content)
      } else {
        runReadMetadata({
          prompt: val,
          document,
          fullPath: document.path,
          promptlVersion: document.promptlVersion,
          providerNames,
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

  const onChange = useCallback(
    (newPrompt: string) => {
      setValue(newPrompt)

      debouncedSave(newPrompt)
    },
    [debouncedSave, setValue],
  )
  useEffect(() => {
    runReadMetadata({
      prompt: value,
      fullPath: 'evaluation',
      promptlVersion: 1,
      providerNames: providers.map((p) => p.name),
    })
  }, [providers, value, runReadMetadata])
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
                title={evaluation.name}
                leftActions={
                  <ClickToCopyUuid
                    tooltipContent='Click to copy the evaluation UUID'
                    uuid={evaluation.uuid}
                  />
                }
                metadata={metadata}
                prompt={evaluation.configuration.prompt}
                onChangePrompt={onChange}
                freeRunsCount={freeRunsCount}
                showCopilotSetting={copilotEnabled}
              />
              <TextEditor
                compileErrors={metadata?.errors}
                value={evaluation.configuration.prompt}
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
              <Playground metadata={metadata!} />
            </div>
          </SplitPane.Pane>
        }
      />
    </>
  )
}
