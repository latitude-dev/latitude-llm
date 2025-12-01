import { useCallback, useMemo } from 'react'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MessageList } from '$/components/ChatWrapper'
import DebugToggle from '$/components/DebugToggle'
import { ROUTES } from '$/services/routes'
import {
  CompletedRun,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  Run,
  RunSourceGroup,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import Link from 'next/link'
import { useTrace } from '$/stores/traces'
import {
  findCompletionSpanFromTrace,
  adaptCompletionSpanMessagesToLegacy,
} from '@latitude-data/core/services/tracing/spans/findCompletionSpanFromTrace'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { sum } from 'lodash-es'
import { useCompletedRunsKeysetPaginationStore } from '$/stores/completedRunsKeysetPagination'
import { useAnnotationBySpan } from '$/hooks/useAnnotationsBySpan'
import { useAnnotationsProgress } from '$/stores/issues/annotationsProgress'
import { RunPanelStats } from '$/components/RunPanelStats'

export function RunPanel({
  run,
  sourceGroup,
}: {
  run: Run
  sourceGroup: RunSourceGroup
}) {
  const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
    key: AppLocalStorage.chatDebugMode,
    defaultValue: false,
  })

  return (
    <CompletedRunPanel
      run={run as CompletedRun}
      debugMode={debugMode}
      setDebugMode={setDebugMode}
      sourceGroup={sourceGroup}
    />
  )
}

function CompletedRunPanel({
  run,
  debugMode,
  setDebugMode,
  sourceGroup,
}: {
  run: CompletedRun
  debugMode: boolean
  setDebugMode: (debugMode: boolean) => void
  sourceGroup: RunSourceGroup
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: trace, isLoading: isLoadingTrace } = useTrace({
    traceId: run.span.traceId,
  })
  const completionSpan = useMemo(
    () => findCompletionSpanFromTrace(trace),
    [trace],
  )
  const conversation = useMemo(
    () => adaptCompletionSpanMessagesToLegacy(completionSpan),
    [completionSpan],
  )
  const { annotations, isLoading: isLoadingAnnotations } = useAnnotationBySpan({
    project,
    commit,
    span: run.span,
  })
  const toolContentMap = useToolContentMap(conversation as unknown as Message[])
  const sourceMapAvailable = useMemo(() => {
    return conversation.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [conversation])

  const buildSelectedSpanUrl = useCallback(
    ({
      projectId,
      commitUuid,
      run,
    }: {
      projectId: number
      commitUuid: string
      run: CompletedRun
    }) => {
      const filters = encodeURIComponent(
        JSON.stringify({
          spanId: run.span.id,
          traceId: run.span.traceId,
        }),
      )
      return (
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: run.span.documentUuid! }).traces.root +
        `?filters=${filters}`
      )
    },
    [],
  )

  const isLoading = isLoadingTrace || isLoadingAnnotations
  if (isLoading) {
    return (
      <div className='w-full h-full flex flex-1 justify-center items-center gap-2'>
        <Icon
          name='loader'
          color='foregroundMuted'
          className='animate-spin mt-px stroke-[2.25]'
        />
        <Text.H4M color='foregroundMuted'>Assembling run...</Text.H4M>
      </div>
    )
  }

  return (
    <div className='w-full flex flex-col gap-6 p-6 overflow-hidden overflow-y-auto custom-scrollbar relative'>
      <div className='w-full min-h-0 flex flex-1 flex-col justify-start items-start gap-4'>
        {completionSpan && (
          <RunPanelStats
            tokens={
              sum(Object.values(completionSpan.metadata?.tokens ?? {})) ?? 0
            }
            cost={completionSpan.metadata?.cost ?? 0}
            duration={run.span.duration ?? 0}
            error={run.span.status === 'error' ? run.span.message : undefined}
            isWaiting={false}
            isRunning={false}
          />
        )}
        <div className='w-full flex justify-center items-center'>
          <Link
            href={buildSelectedSpanUrl({
              projectId: project.id,
              commitUuid: commit.uuid,
              run,
            })}
            target='_blank'
          >
            <Button
              variant='link'
              iconProps={{
                name: 'arrowUpRight',
                widthClass: 'w-4',
                heightClass: 'h-4',
                placement: 'right',
              }}
            >
              See complete log
            </Button>
          </Link>
        </div>
        {conversation.length > 0 ? (
          <div className='w-full flex flex-col'>
            <div className='flex flex-row items-center justify-between w-full pb-2'>
              <Text.H6M>Messages</Text.H6M>
              {sourceMapAvailable && (
                <div className='flex flex-row gap-2 items-center'>
                  <DebugToggle enabled={debugMode} setEnabled={setDebugMode} />
                </div>
              )}
            </div>
            <MessageList
              messages={conversation as unknown as Message[]}
              parameters={Object.keys(run.span.metadata?.parameters ?? {})}
              debugMode={debugMode}
              toolContentMap={toolContentMap}
            />
          </div>
        ) : (
          <Text.H5 color='foregroundMuted'>
            No messages generated for this run
          </Text.H5>
        )}
        <div className='w-full flex flex-col gap-y-4 pt-4'>
          {run.span.status !== 'error' && annotations.bottom && (
            <AnnotationFormWrapper
              key={annotations.bottom.evaluation.uuid}
              evaluation={
                annotations.bottom.evaluation as EvaluationV2<
                  EvaluationType.Human,
                  HumanEvaluationMetric
                >
              }
              result={annotations.bottom.result}
              span={run.span as SpanWithDetails<SpanType.Prompt>}
              sourceGroup={sourceGroup}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function AnnotationFormWrapper({
  evaluation,
  span,
  result,
  sourceGroup,
}: {
  evaluation: EvaluationV2<EvaluationType.Human, HumanEvaluationMetric>
  span: SpanWithDetails<SpanType.Prompt>
  result?: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>
  sourceGroup: RunSourceGroup
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { refetch: refetchProgress } = useAnnotationsProgress({
    projectId: project.id,
    commitUuid: commit.uuid,
  })
  const { mutate } = useCompletedRunsKeysetPaginationStore({
    projectId: project.id,
    sourceGroup,
  })

  const handleAnnotate = useCallback(() => {
    refetchProgress()
    mutate()
  }, [mutate, refetchProgress])

  return (
    <AnnotationForm
      evaluation={evaluation}
      result={result}
      span={span}
      onAnnotate={handleAnnotate}
    />
  )
}
