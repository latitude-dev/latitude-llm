import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { ConversationMetadata } from 'promptl-ai'
import { cn } from '@latitude-data/web-ui/utils'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import {
  PLAYGROUND_COLLAPSED_SIZE,
  PLAYGROUND_GAP_PADDING,
} from '$/hooks/playgrounds/constants'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import PreviewPrompt from '$/components/PlaygroundCommon/PreviewPrompt'
import Chat from '$/components/PlaygroundCommon/Chat'
import { useExpandParametersOrEvaluations } from '$/hooks/playgrounds/useExpandParametersOrEvaluations'
import {
  Commit,
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/browser'
import { useEvaluationParameters } from '../hooks/useEvaluationParamaters'
import { useRunEvaluationPlaygroundPrompt } from './useRunEvaluationPlaygroundPrompt'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import EvaluationParams from './EvaluationParams'

export const Playground = memo(
  ({
    commit,
    document,
    evaluation,
    metadata,
  }: {
    commit: Commit
    document: DocumentVersion
    evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
    metadata: ConversationMetadata
  }) => {
    const { project } = useCurrentProject()
    const [mode, setMode] = useState<'preview' | 'chat'>('preview')
    const [forcedSize, setForcedSize] = useState<number | undefined>()
    const expander = useExpandParametersOrEvaluations({
      initialExpanded: 'parameters',
    })
    const collapsed = expander.expandedSection === null
    useEffect(() => {
      setForcedSize(collapsed ? PLAYGROUND_COLLAPSED_SIZE : undefined)
    }, [collapsed])
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
    const runPromptFn = useRunEvaluationPlaygroundPrompt({
      projectId: project.id,
      commit,
      document,
      evaluation,
      parameters,
    })
    const firstPane = useMemo(() => {
      return (
        <div className={cn('grid gap-2 w-full pr-0.5', expander.cssClass)}>
          <EvaluationParams
            document={document}
            commit={commit}
            evaluation={evaluation}
            onToggle={expander.onToggle('parameters')}
            isExpanded={expander.parametersExpanded}
          />
        </div>
      )
    }, [expander, commit, document, evaluation])

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
    ])

    return (
      <SplitPane
        direction='vertical'
        gap={4}
        initialPercentage={30}
        forcedSize={forcedSize}
        minSize={PLAYGROUND_COLLAPSED_SIZE + PLAYGROUND_GAP_PADDING}
        dragDisabled={collapsed}
        firstPane={firstPane}
        secondPane={secondPane}
      />
    )
  },
)
