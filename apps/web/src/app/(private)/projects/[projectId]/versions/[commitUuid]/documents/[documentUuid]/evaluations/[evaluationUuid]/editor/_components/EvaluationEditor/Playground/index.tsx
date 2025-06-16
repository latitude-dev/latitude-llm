import Chat from '$/components/PlaygroundCommon/Chat'
import PreviewPrompt from '$/components/PlaygroundCommon/PreviewPrompt'
import {
  EVALUATION_PLAYGROUND_COLLAPSED_SIZE,
  EVALUATION_PLAYGROUND_GAP_PADDING,
} from '$/hooks/playgrounds/constants'
import { useExpandParametersOrEvaluations } from '$/hooks/playgrounds/useExpandParametersOrEvaluations'
import {
  Commit,
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import type { ResolvedMetadata } from '$/workers/readMetadata'
import { memo, useCallback, useMemo, useState } from 'react'
import { useEvaluationParameters } from '../hooks/useEvaluationParamaters'
import EvaluationParams from './EvaluationParams'
import { useRunEvaluationPlaygroundPrompt } from './useRunEvaluationPlaygroundPrompt'

export const Playground = memo(
  ({
    commit,
    document,
    evaluation,
    metadata,
    selectedDocumentLogUuid,
  }: {
    commit: Commit
    document: DocumentVersion
    evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
    metadata: ResolvedMetadata
    selectedDocumentLogUuid?: string
  }) => {
    const { project } = useCurrentProject()
    const [mode, setMode] = useState<'preview' | 'chat'>('preview')
    const expander = useExpandParametersOrEvaluations({
      initialExpanded: 'parameters',
    })
    const collapsed = expander.expandedSection === null
    const forcedSize = collapsed
      ? EVALUATION_PLAYGROUND_COLLAPSED_SIZE
      : undefined
    const { value: expandParameters, setValue: setExpandParameters } =
      useLocalStorage({
        key: AppLocalStorage.expandParameters,
        defaultValue: false,
      })
    const clearChat = useCallback(() => setMode('preview'), [setMode])
    const runPrompt = useCallback(() => setMode('chat'), [setMode])
    const { parameters, parametersReady } = useEvaluationParameters({
      commitVersionUuid: commit.uuid,
      document,
      evaluation,
    })
    const { runPromptFn, abortCurrentStream, hasActiveStream } =
      useRunEvaluationPlaygroundPrompt({
        projectId: project.id,
        commit,
        document,
        evaluation,
        parameters,
      })
    const firstPane = useMemo(() => {
      return (
        <div className='grid w-full pr-0.5'>
          <EvaluationParams
            document={document}
            commit={commit}
            evaluation={evaluation}
            onToggle={expander.onToggle('parameters')}
            isExpanded={expander.parametersExpanded}
            selectedDocumentLogUuid={selectedDocumentLogUuid}
          />
        </div>
      )
    }, [expander, commit, document, evaluation, selectedDocumentLogUuid])

    const secondPane = useMemo(() => {
      if (!parametersReady) return null

      return (
        <div className='h-full flex-grow flex-shrink min-h-0 flex flex-col gap-2 overflow-hidden pr-0.5'>
          {mode === 'preview' ? (
            <PreviewPrompt
              metadata={metadata}
              parameters={parameters}
              runPrompt={runPrompt}
              expandParameters={expandParameters}
              setExpandParameters={setExpandParameters}
            />
          ) : (
            <Chat
              canChat={false}
              parameters={parameters}
              clearChat={clearChat}
              expandParameters={expandParameters}
              setExpandParameters={setExpandParameters}
              runPromptFn={runPromptFn}
              abortCurrentStream={abortCurrentStream}
              hasActiveStream={hasActiveStream}
            />
          )}
        </div>
      )
    }, [
      clearChat,
      expandParameters,
      metadata,
      mode,
      parameters,
      runPromptFn,
      runPrompt,
      setExpandParameters,
      parametersReady,
      abortCurrentStream,
      hasActiveStream,
    ])

    return (
      <SplitPane
        direction='vertical'
        gap={4}
        initialPercentage={50}
        forcedSize={forcedSize}
        minSize={
          EVALUATION_PLAYGROUND_COLLAPSED_SIZE +
          EVALUATION_PLAYGROUND_GAP_PADDING
        }
        dragDisabled={collapsed}
        firstPane={firstPane}
        secondPane={secondPane}
      />
    )
  },
)
