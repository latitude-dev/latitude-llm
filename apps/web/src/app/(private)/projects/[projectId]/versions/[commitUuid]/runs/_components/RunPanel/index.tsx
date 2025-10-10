'use client'

import { RunErrorMessage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/_components/RunErrorMessage'
import { DocumentLogAnnotation } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/logs/_components/DocumentLogs/DocumentLogInfo/Annotation'
import Chat from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/V2Playground/Chat'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MessageList } from '$/components/ChatWrapper'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import ReadingToggle from '$/components/ReadingToggle'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useOnce } from '$/hooks/useMount'
import { ROUTES } from '$/services/routes'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useProviderLogs, { useProviderLog } from '$/stores/providerLogs'
import { useActiveRuns } from '$/stores/runs/activeRuns'
import { useCompletedRuns } from '$/stores/runs/completedRuns'
import {
  ActiveRun,
  CompletedRun,
  EvaluationResultV2,
  Run,
  RunAnnotation,
} from '@latitude-data/constants'
import { buildConversation } from '@latitude-data/core/helpers'
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

export function RunPanel({
  run,
  attachRun,
  isAttachingRun,
  stopRun,
  isStoppingRun,
  mutateCompletedRuns,
}: {
  run: Run
  attachRun: ReturnType<typeof useActiveRuns>['attachRun']
  isAttachingRun: ReturnType<typeof useActiveRuns>['isAttachingRun']
  stopRun: ReturnType<typeof useActiveRuns>['stopRun']
  isStoppingRun: ReturnType<typeof useActiveRuns>['isStoppingRun']
  mutateCompletedRuns: ReturnType<typeof useCompletedRuns>['mutate']
}) {
  const { value: expandParameters, setValue: setExpandParameters } =
    useLocalStorage({
      key: AppLocalStorage.expandParameters,
      defaultValue: false,
    })

  if (run.endedAt) {
    return (
      <CompletedRunPanel
        run={run as CompletedRun}
        mutateCompletedRuns={mutateCompletedRuns}
        expandParameters={expandParameters}
        setExpandParameters={setExpandParameters}
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
      expandParameters={expandParameters}
      setExpandParameters={setExpandParameters}
    />
  )
}

function CompletedRunPanel({
  run,
  mutateCompletedRuns,
  expandParameters,
  setExpandParameters,
}: {
  run: CompletedRun
  mutateCompletedRuns: ReturnType<typeof useCompletedRuns>['mutate']
  expandParameters: boolean
  setExpandParameters: (value: boolean) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()

  const {
    data: evaluations,
    isLoading: isLoadingEvaluations,
    annotateEvaluation,
    isAnnotatingEvaluation,
  } = useEvaluationsV2({
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

  const {
    data: results,
    isLoading: isLoadingResults,
    mutate: mutateResults,
  } = useEvaluationResultsV2ByDocumentLogs({
    project: project,
    commit: commit,
    document: {
      commitId: commit.id,
      documentUuid: run.log.documentUuid,
    },
    documentLogUuids: [run.log.uuid],
  })
  const manualResults = useMemo(() => {
    if (!results[run.log.uuid]) return {}
    return results[run.log.uuid].reduce<Record<string, EvaluationResultV2>>(
      (acc, r) => {
        const e = manualEvaluations.find((e) => r.evaluation.uuid === e.uuid)
        if (e) acc[r.evaluation.uuid] = r.result
        return acc
      },
      {},
    )
  }, [results, run.log.uuid, manualEvaluations])

  const syncAnnotations: typeof mutateResults = useCallback(
    async (data, opts) => {
      const mutated = (await mutateResults(data, opts)) as typeof results

      const annotations = (mutated?.[run.log.uuid]?.filter(({ evaluation }) =>
        manualEvaluations.find((e) => evaluation.uuid === e.uuid),
      ) ?? []) as RunAnnotation[]

      mutateCompletedRuns(
        (prev) =>
          prev?.map((r) => {
            if (r.uuid !== run.uuid) return r
            return { ...r, annotations }
          }) ?? [],
        { revalidate: false },
      )

      return mutated
    },
    [mutateResults, mutateCompletedRuns, run, manualEvaluations],
  )

  const { data: providerLogs, isLoading: isLoadingProviderLogs } =
    useProviderLogs({ documentLogUuid: run.log.uuid })
  // Note: this is needed to hydrate the provider log
  const { data: responseLog, isLoading: isLoadingResponseLog } = useProviderLog(
    providerLogs?.at(-1)?.id,
  )

  const conversation = useMemo(() => {
    if (!responseLog) return []
    return buildConversation(responseLog)
  }, [responseLog])
  const toolContentMap = useToolContentMap(conversation)
  const sourceMapAvailable = useMemo(() => {
    return conversation.some((message) => {
      if (typeof message.content !== 'object') return false
      return message.content.some((content) => '_promptlSourceMap' in content)
    })
  }, [conversation])

  const isLoading =
    isLoadingEvaluations ||
    isLoadingResults ||
    isLoadingProviderLogs ||
    isLoadingResponseLog

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
                  <ReadingToggle
                    enabled={expandParameters}
                    setEnabled={setExpandParameters}
                  />
                </div>
              )}
            </div>
            <MessageList
              messages={conversation}
              parameters={Object.keys(run.log.parameters)}
              collapseParameters={!expandParameters}
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
            !!responseLog &&
            manualEvaluations.map((evaluation) => (
              <DocumentLogAnnotation
                key={evaluation.uuid}
                evaluation={evaluation}
                result={manualResults[evaluation.uuid]}
                mutateEvaluationResults={syncAnnotations}
                providerLog={responseLog}
                documentLog={run.log}
                commit={run.log.commit}
                annotateEvaluation={annotateEvaluation}
                isAnnotatingEvaluation={isAnnotatingEvaluation}
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
  expandParameters,
  setExpandParameters,
}: {
  run: ActiveRun
  attachRun: ReturnType<typeof useActiveRuns>['attachRun']
  isAttachingRun: ReturnType<typeof useActiveRuns>['isAttachingRun']
  stopRun: ReturnType<typeof useActiveRuns>['stopRun']
  isStoppingRun: ReturnType<typeof useActiveRuns>['isStoppingRun']
  expandParameters: boolean
  setExpandParameters: (value: boolean) => void
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
          expandParameters={expandParameters}
          setExpandParameters={setExpandParameters}
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
