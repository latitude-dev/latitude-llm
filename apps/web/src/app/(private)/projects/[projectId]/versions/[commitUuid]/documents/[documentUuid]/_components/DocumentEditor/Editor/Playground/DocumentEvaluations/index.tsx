import useConnectedEvaluations from '$/stores/connectedEvaluations'
import useEvaluationResultsByDocumentLogs from '$/stores/evaluationResultsByDocumentLogs'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import { DocumentVersion } from '@latitude-data/core/browser'
import {
  ClientOnly,
  CollapsibleBox,
  OnExpandFn,
  useCurrentProject,
  type ICommitContextType,
} from '@latitude-data/web-ui'

import {
  CollapsedContentHeader,
  ExpandedContent,
  ExpandedContentHeader,
} from './BoxContent'
import { Props } from './shared'

const useEvaluationResultsSocket = ({
  documentLog,
  evaluations,
  mutate,
}: {
  documentLog?: DocumentLogWithMetadata
  evaluations: Props['evaluations']
  mutate: ReturnType<typeof useEvaluationResultsByDocumentLogs>['mutate']
}) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultCreated'>) => {
      if (!args.row || !documentLog) return
      if (args.row.documentLogId !== documentLog.id) return
      if (!args.row.resultableId || !args.row.evaluatedProviderLogId) return
      const evaluation = evaluations.find(
        (evaluation) =>
          evaluation.live && evaluation.id === args.row.evaluationId,
      )
      if (!evaluation) return

      mutate(
        (prev) => ({
          ...(prev ?? {}),
          [documentLog.id]: (prev?.[documentLog.id] ?? []).concat([
            { result: args.row, evaluation },
          ]),
        }),
        { revalidate: false },
      )
    },
    [documentLog, evaluations, mutate],
  )

  useSockets({ event: 'evaluationResultCreated', onMessage })
}

export default function DocumentEvaluations({
  documentLog,
  document,
  commit,
  runCount,
  onExpand,
  isLoading: isDocumentLogLoading,
}: {
  documentLog?: DocumentLogWithMetadata
  document: DocumentVersion
  commit: ICommitContextType['commit']
  runCount: number
  onExpand?: OnExpandFn
  isLoading: boolean
}) {
  const { project } = useCurrentProject()

  const { data: connectedEvaluations, isLoading: isEvaluationsLoading } =
    useConnectedEvaluations({
      documentUuid: document.documentUuid,
      projectId: project.id,
      commitUuid: commit.uuid,
    })
  const evaluations = useMemo(
    () =>
      connectedEvaluations.map(({ evaluation, live }) => ({
        ...evaluation,
        live,
      })),
    [connectedEvaluations],
  )

  const { data: evaluationResults, mutate } =
    useEvaluationResultsByDocumentLogs({
      documentLogIds: documentLog ? [documentLog.id] : [],
    })
  useEvaluationResultsSocket({ documentLog, evaluations, mutate })
  const results = useMemo(() => {
    if (!documentLog || !evaluationResults[documentLog.id]) return {}
    return evaluationResults[documentLog.id]!.reduce(
      (acc, { result }) => {
        acc[result.evaluationId] = result
        return acc
      },
      {} as Props['results'],
    )
  }, [evaluationResults])

  const [awaitable, setAwaitable] = useState<{
    documentLog?: DocumentLogWithMetadata
    results: number
  }>({ results: 0 })
  useEffect(() => {
    if (!documentLog) return
    if (isDocumentLogLoading || isEvaluationsLoading) return
    if (awaitable.documentLog?.id === documentLog.id) return
    setAwaitable({
      documentLog: documentLog,
      results: evaluations.filter((evaluation) => evaluation.live).length,
    })
  }, [isDocumentLogLoading, documentLog, isEvaluationsLoading, evaluations])

  const isWaiting = useMemo(
    () =>
      (runCount > 0 && !documentLog) ||
      isDocumentLogLoading ||
      Object.values(results).filter(
        (result) => result.documentLogId === documentLog?.id,
      ).length < awaitable.results,
    [runCount, isDocumentLogLoading, documentLog, results, awaitable],
  )

  const props = {
    results,
    evaluations,
    document,
    commit,
    project,
    runCount,
    isLoading: isEvaluationsLoading,
    isWaiting,
  }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Evaluations'
        icon='listCheck'
        initialExpanded={false}
        collapsedContentHeader={<CollapsedContentHeader {...props} />}
        expandedContent={<ExpandedContent {...props} />}
        expandedContentHeader={<ExpandedContentHeader {...props} />}
        onExpand={onExpand}
      />
    </ClientOnly>
  )
}
