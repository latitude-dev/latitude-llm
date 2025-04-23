'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import EditorHeader from '$/components/EditorHeader'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { useMetadata } from '$/hooks/useMetadata'
import { useAgentToolsMap } from '$/stores/agentToolsMap'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useIntegrations from '$/stores/integrations'
import useProviderApiKeys from '$/stores/providerApiKeys'
import {
  EvaluationType,
  LlmEvaluationMetric,
} from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { DiffOptions } from 'node_modules/@latitude-data/web-ui/src/ds/molecules/DocumentTextEditor/types'
import { useCallback, useEffect, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Playground } from './Playground'
import { TextEditor } from './TextEditor'

export function EditorPage({
  freeRunsCount,
  copilotEnabled,
}: {
  freeRunsCount?: number
  copilotEnabled: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Custom
  >()

  const { updateEvaluation } = useEvaluationsV2({
    project: project,
    commit: commit,
    document: document,
    silent: true,
  })
  const { data: providers } = useProviderApiKeys()
  const { data: integrations } = useIntegrations()

  const [prompt, setPrompt] = useState(evaluation.configuration.prompt)
  const [isSaved, setIsSaved] = useState(true)
  const [diff, setDiff] = useState<DiffOptions>()
  const debouncedSave = useDebouncedCallback(
    async (newPrompt: string) => {
      const [_, errors] = await updateEvaluation({
        evaluationUuid: evaluation.uuid,
        settings: {
          configuration: {
            ...evaluation.configuration,
            prompt: newPrompt,
          },
        },
      })
      if (errors) return
      setIsSaved(true)
    },
    500,
    { trailing: true },
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
      prompt: prompt,
      fullPath: 'evaluation',
      promptlVersion: 1,
      agentToolsMap: agentToolsMap,
      providerNames: providers.map((p) => p.name),
      integrationNames: integrations.map((i) => i.name),
    })
  }, [agentToolsMap, providers, integrations])

  const onChange = useCallback(
    (newPrompt: string) => {
      setIsSaved(false)
      setPrompt(newPrompt)
      debouncedSave(newPrompt)
      runReadMetadata({
        prompt: newPrompt,
        fullPath: 'evaluation',
        promptlVersion: 1,
        agentToolsMap: agentToolsMap,
        providerNames: providers.map((p) => p.name),
        integrationNames: integrations.map((i) => i.name),
      })
    },
    [
      setIsSaved,
      setPrompt,
      debouncedSave,
      runReadMetadata,
      agentToolsMap,
      providers,
      integrations,
    ],
  )

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
                prompt={prompt}
                onChangePrompt={onChange}
                freeRunsCount={freeRunsCount}
                showCopilotSetting={copilotEnabled}
              />
              <TextEditor
                compileErrors={metadata?.errors}
                project={project}
                document={document}
                commit={commit}
                setDiff={setDiff}
                diff={diff}
                value={prompt}
                copilotEnabled={copilotEnabled}
                isMerged={commit.mergedAt !== null}
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
                prompt={prompt}
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
