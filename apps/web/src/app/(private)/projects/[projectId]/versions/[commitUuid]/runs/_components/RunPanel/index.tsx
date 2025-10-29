import { RunErrorMessage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/_components/RunErrorMessage'
import { AnnotationForm } from '$/components/evaluations/Annotation/Form'
import Chat from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MessageList } from '$/components/ChatWrapper'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import DebugToggle from '$/components/DebugToggle'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useOnce } from '$/hooks/useMount'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import {
  ActiveRun,
  CompletedRun,
  EvaluationResultV2,
  Run,
  SpanType,
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
import { useCallback, useMemo } from 'react'
import { RunPanelStats } from './Stats'
import { useConversation } from '$/stores/conversations'
import { useTrace } from '$/stores/traces'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/findFirstSpanOfType'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { Message } from '@latitude-data/constants/legacyCompiler'

export function RunPanel({
  run,
  attachRun,
  isAttachingRun,
  stopRun,
  isStoppingRun,
}: {
  run: Run
  attachRun: ReturnType<typeof useActiveRuns>['attachRun']
  isAttachingRun: ReturnType<typeof useActiveRuns>['isAttachingRun']
  stopRun: ReturnType<typeof useActiveRuns>['stopRun']
  isStoppingRun: ReturnType<typeof useActiveRuns>['isStoppingRun']
}) {
  const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
    key: AppLocalStorage.chatDebugMode,
    defaultValue: false,
  })

  if (run.endedAt) {
    return (
      <CompletedRunPanel
        run={run as CompletedRun}
        debugMode={debugMode}
        setDebugMode={setDebugMode}
      />
    )
  }

  return (
    <ActiveRunPanel
      run={run as ActiveRun}
      attachRun={attachRun}
      isAttachingRun={isAttachingRun}
      stopRun={stopRun}
      isStoppingRun={isStoppingRun}
      debugMode={debugMode}
      setDebugMode={setDebugMode}
    />
  )
}

function CompletedRunPanel({
  run,
  debugMode,
  setDebugMode,
}: {
  run: CompletedRun
  debugMode: boolean
  setDebugMode: (debugMode: boolean) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({
      project: project,
      commit: commit,
      document: {
        commitId: commit.id,
        documentUuid: run.log.documentUuid,
      },
    })
  const manualEvaluations = useMemo(
    () =>
      evaluations.filter(
        (e) => getEvaluationMetricSpecification(e).supportsManualEvaluation,
      ),
    [evaluations],
  )

  const { data: traces, isLoading: isLoadingTraces } = useConversation({
    conversationId: run.log.uuid,
  })
  const { data: trace, isLoading: isLoadingTrace } = useTrace({
    traceId: traces[0],
  })
  const span = findFirstSpanOfType(trace?.children ?? [], SpanType.Prompt)
  const completionSpan = findFirstSpanOfType(
    trace?.children ?? [],
    SpanType.Completion,
  )
  const { data: results, isLoading: isLoadingResults } =
    useEvaluationResultsV2BySpans({
      project: project,
      commit: commit,
      document: {
        commitId: commit.id,
        documentUuid: run.log.documentUuid,
      },
      spanId: span?.id,
      traceId: span?.traceId,
    })
  const manualResults = useMemo(() => {
    return results.reduce<Record<string, EvaluationResultV2>>((acc, r) => {
      const e = manualEvaluations.find((e) => r.evaluation.uuid === e.uuid)
      if (e) acc[r.evaluation.uuid] = r.result
      return acc
    }, {})
  }, [results, manualEvaluations])

  const conversation = useMemo(() => {
    if (!completionSpan) return []

    return [
      ...(completionSpan?.metadata?.input ?? []),
      ...(completionSpan?.metadata?.output ?? []),
    ]
  }, [completionSpan])
  const toolContentMap = useToolContentMap(conversation as unknown as Message[])
  const sourceMapAvailable = useMemo(() => {
    return conversation.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [conversation])

  const isLoading =
    isLoadingEvaluations ||
    isLoadingResults ||
    isLoadingTraces ||
    isLoadingTrace

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
        <RunPanelStats
          tokens={run.log.tokens ?? 0}
          cost={run.log.costInMillicents ?? 0}
          duration={run.log.duration ?? 0}
          error={run.log.error.message ?? undefined}
          isWaiting={false}
          isRunning={false}
        />
        <div className='w-full flex justify-center items-center'>
          <Link
            href={
              ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: run.log.documentUuid }).logs.root +
              `?logUuid=${run.log.uuid}`
            }
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
              parameters={Object.keys(run.log.parameters)}
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
          {run.log.error.code ? (
            <RunErrorMessage error={run.log.error} />
          ) : (
            manualEvaluations.length > 0 &&
            !!span &&
            manualEvaluations.map((evaluation) => (
              <AnnotationForm
                key={evaluation.uuid}
                evaluation={evaluation}
                result={manualResults[evaluation.uuid]}
                span={span}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ActiveRunPanel({
  run,
  attachRun,
  isAttachingRun,
  stopRun,
  isStoppingRun,
  debugMode,
  setDebugMode,
}: {
  run: ActiveRun
  attachRun: ReturnType<typeof useActiveRuns>['attachRun']
  isAttachingRun: ReturnType<typeof useActiveRuns>['isAttachingRun']
  stopRun: ReturnType<typeof useActiveRuns>['stopRun']
  isStoppingRun: ReturnType<typeof useActiveRuns>['isStoppingRun']
  debugMode: boolean
  setDebugMode: (debugMode: boolean) => void
}) {
  const runPromptFn = useCallback(() => {
    return attachRun({ runUuid: run.uuid })
  }, [run.uuid, attachRun])

  const abortRunFn = useCallback(() => {
    return stopRun({ runUuid: run.uuid })
  }, [run.uuid, stopRun])

  const playground = usePlaygroundChat({ runPromptFn })
  useOnce(() => playground.start(), !!run.startedAt)

  if (!run.startedAt) {
    return (
      <div className='w-full h-full flex flex-1 justify-center items-center gap-2'>
        <Icon
          name='loader'
          color='foregroundMuted'
          className='animate-spin mt-px stroke-[2.25]'
        />
        <Text.H4M color='foregroundMuted'>
          Waiting run to get started...
        </Text.H4M>
      </div>
    )
  }

  return (
    <div className='w-full flex flex-col gap-6 p-6 overflow-hidden overflow-y-auto custom-scrollbar relative'>
      <div className='w-full min-h-0 flex flex-1 flex-col justify-start items-start gap-6'>
        <RunPanelStats
          tokens={
            // TODO(runs): add all token types
            (playground.usage.totalTokens ||
              playground.usage.promptTokens ||
              playground.usage.completionTokens) ??
            0
          }
          cost={playground.cost ?? 0}
          duration={playground.duration ?? 0}
          error={playground.error?.message ?? undefined}
          isWaiting={!run.startedAt && !playground.isLoading}
          isRunning={playground.isLoading}
          abortRun={abortRunFn}
          isAbortingRun={isStoppingRun}
          canAbortRun={isAttachingRun() && playground.isLoading}
          runAborted={!isAttachingRun() && !playground.isLoading}
        />
        <Chat
          showHeader={true}
          playground={playground}
          parameters={undefined} // Note: we don't know which version was used
          debugMode={debugMode}
          setDebugMode={setDebugMode}
        />
        {!playground.duration && (
          <div className='w-full h-full flex flex-1 justify-center items-center gap-2'>
            <Icon
              name='loader'
              color='foregroundMuted'
              className='animate-spin mt-px stroke-[2.25]'
            />
            <Text.H4M color='foregroundMuted'>
              Waiting for a response...
            </Text.H4M>
          </div>
        )}
      </div>
    </div>
  )
}
