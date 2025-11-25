import { MessageListSkeleton } from '$/components/ChatWrapper'
import Chat from '$/components/PlaygroundCommon/Chat'
import PreviewPrompt from '$/components/PlaygroundCommon/PreviewPrompt'
import {
  EVALUATION_PLAYGROUND_COLLAPSED_SIZE,
  EVALUATION_PLAYGROUND_GAP_PADDING,
} from '$/hooks/playgrounds/constants'
import { useExpandParametersOrEvaluations } from '$/hooks/playgrounds/useExpandParametersOrEvaluations'
import { ROUTES } from '$/services/routes'
import type { ResolvedMetadata } from '$/workers/readMetadata'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import Link from 'next/link'
import { memo, useCallback, useMemo, useState } from 'react'
import { useEvaluationParameters } from '../hooks/useEvaluationParamaters'
import EvaluationParams from './EvaluationParams'
import { useLogHistoryParams } from './EvaluationParams/HistoryLogParams/useLogHistoryParams'
import { useRunEvaluationPlaygroundPrompt } from './useRunEvaluationPlaygroundPrompt'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetricAnyCustom,
} from '@latitude-data/core/constants'

export const Playground = memo(
  ({
    commit,
    document,
    evaluation,
    metadata,
    selectedTraceId,
  }: {
    commit: Commit
    document: DocumentVersion
    evaluation: EvaluationV2<EvaluationType.Llm, LlmEvaluationMetricAnyCustom>
    metadata: ResolvedMetadata
    selectedSpanId?: string
    selectedTraceId?: string
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
    const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
      key: AppLocalStorage.chatDebugMode,
      defaultValue: false,
    })
    const clearChat = useCallback(() => setMode('preview'), [setMode])
    const runPrompt = useCallback(() => setMode('chat'), [setMode])
    const { parameters, parametersReady } = useEvaluationParameters({
      commitVersionUuid: commit.uuid,
      document,
      evaluation,
    })
    const historyInfo = useLogHistoryParams({
      commitVersionUuid: commit.uuid,
      document,
      evaluation,
      selectedTraceId,
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
            historyInfo={historyInfo}
          />
        </div>
      )
    }, [expander, commit, document, evaluation, historyInfo])

    const secondPane = useMemo(() => {
      if (historyInfo.isLoading) {
        return (
          <div className='h-full w-full flex flex-col items-center justify-start gap-2 overflow-y-auto pr-0.5 custom-scrollbar scrollable-indicator'>
            <div className='w-full flex flex-shrink-0 items-center justify-between'>
              <Text.H6M>Preview</Text.H6M>
              <Skeleton className='w-20 h-4' />
            </div>
            <MessageListSkeleton messages={4} />
          </div>
        )
      }

      if (!parametersReady) return null

      return (
        <div className='h-full flex-grow flex-shrink min-h-0 flex flex-col gap-2 overflow-hidden pr-0.5'>
          {mode === 'preview' ? (
            <PreviewPrompt
              showHeader
              metadata={metadata}
              parameters={parameters}
              runPrompt={runPrompt}
              debugMode={debugMode}
              setDebugMode={setDebugMode}
            />
          ) : (
            <Chat
              showHeader
              canChat={false}
              parameters={parameters}
              clearChat={clearChat}
              debugMode={debugMode}
              setDebugMode={setDebugMode}
              runPromptFn={runPromptFn}
              abortCurrentStream={abortCurrentStream}
              hasActiveStream={hasActiveStream}
              isRunStream={false}
            />
          )}
        </div>
      )
    }, [
      clearChat,
      debugMode,
      metadata,
      mode,
      parameters,
      runPromptFn,
      runPrompt,
      setDebugMode,
      parametersReady,
      abortCurrentStream,
      hasActiveStream,
      historyInfo.isLoading,
    ])

    if (!historyInfo.isLoading && !historyInfo.selectedPromptSpan) {
      return (
        <div className='h-full w-full'>
          <BlankSlate>
            <div className='flex flex-col items-center gap-8 max-w-3xl'>
              <div className='flex flex-col gap-4 items-center'>
                <Text.H4M>No logs found</Text.H4M>
                <Text.H5>
                  Run your prompt to generate logs and test the evaluation
                </Text.H5>
              </div>
              <Link
                href={
                  ROUTES.projects
                    .detail({ id: project.id })
                    .commits.detail({ uuid: commit.uuid })
                    .documents.detail({ uuid: document.documentUuid }).root
                }
              >
                <Button fancy>Run prompt</Button>
              </Link>
            </div>
          </BlankSlate>
        </div>
      )
    }

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
