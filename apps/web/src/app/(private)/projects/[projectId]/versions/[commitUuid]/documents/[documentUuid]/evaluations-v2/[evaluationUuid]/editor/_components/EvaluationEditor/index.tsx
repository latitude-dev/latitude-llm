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
  LlmEvaluationMetricAnyCustom,
  ProviderApiKey,
} from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { TextEditor } from './TextEditor'
import { Playground } from './Playground'
import { useEvaluationParameters } from './hooks/useEvaluationParamaters'
import { BreadcrumbSeparator } from '@latitude-data/web-ui/molecules/Breadcrumb'
import Link from 'next/link'
import { ROUTES } from '$/services/routes'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

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

        setValue(originalPrompt) // Revert to the original prompt if save fails
      } else {
        runReadMetadata({
          prompt: val,
          promptlVersion: 1,
          providerNames,
        })
      }
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
    runReadMetadata({
      prompt: value,
      promptlVersion: 1,
      providerNames,
    })
  }, [providerNames, value, runReadMetadata])
  const backUrl = ROUTES.projects
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
                title={
                  <div className='flex flex-row items-center min-w-0 gap-x-2'>
                    <Link
                      href={backUrl}
                      className='flex flex-row items-center min-w-0 gap-x-2'
                    >
                      <Icon name='chevronLeft' />
                      <Text.H4 ellipsis noWrap>
                        {evaluation.name}
                      </Text.H4>
                    </Link>
                    <BreadcrumbSeparator />
                    <Text.H4 color='foregroundMuted'>Editor</Text.H4>
                  </div>
                }
                leftActions={
                  <ClickToCopyUuid
                    tooltipContent='Click to copy the evaluation UUID'
                    uuid={evaluation.uuid}
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
                value={originalPrompt}
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
              />
            </div>
          </SplitPane.Pane>
        }
      />
    </>
  )
}
