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
import { Props, Snapshot } from './shared'

const useEvaluationResultsSocket = ({
  evaluations,
  mutate,
}: {
  evaluations: Props['evaluations']
  mutate: ReturnType<typeof useEvaluationResultsByDocumentLogs>['mutate']
}) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultCreated'>) => {
      if (!args.row?.resultableId || !args.row?.evaluatedProviderLogId) return
      const evaluation = evaluations.find(
        (e) => e.live && e.id === args.row.evaluationId,
      )
      if (!evaluation) return

      mutate(
        (prev) => ({
          ...(prev ?? {}),
          [args.row.documentLogId]: (
            prev?.[args.row.documentLogId] ?? []
          ).concat([{ result: args.row, evaluation }]),
        }),
        { revalidate: false },
      )
    },
    [evaluations, mutate],
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
  useEvaluationResultsSocket({ evaluations, mutate })
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

  const [snapshot, setSnapshot] = useState<Snapshot>({ results: 0 })
  useEffect(() => {
    if (!documentLog || snapshot.id === documentLog.id) return
    setSnapshot({
      id: documentLog.id,
      results: evaluations.filter((evaluation) => evaluation.live).length,
    })
  }, [documentLog, evaluations])

  const isWaiting = useMemo(
    () =>
      (runCount > 0 && !documentLog) ||
      isDocumentLogLoading ||
      Object.values(results).filter((r) => r.documentLogId === snapshot.id)
        .length < snapshot.results,
    [runCount, isDocumentLogLoading, documentLog, results, snapshot],
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
