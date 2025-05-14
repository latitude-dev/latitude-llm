import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  DocumentVersion,
  EvaluationResultV2,
  EvaluationV2,
} from '@latitude-data/core/browser'
import { DocumentLogWithMetadata } from '@latitude-data/core/repositories'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import {
  CollapsibleBox,
  OnToggleFn,
} from '@latitude-data/web-ui/molecules/CollapsibleBox'
import {
  ICommitContextType,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CollapsedContentHeader,
  ExpandedContent,
  ExpandedContentHeader,
} from './BoxContent'
import { Snapshot, Props as SharedProps } from './shared'

const useEvaluationResultsV2Socket = ({
  evaluations,
  mutate,
}: {
  evaluations: EvaluationV2[]
  mutate: ReturnType<typeof useEvaluationResultsV2ByDocumentLogs>['mutate']
}) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultV2Created'>) => {
      if (!args) return
      const evaluation = evaluations.find(
        (e) => e.versionId === args.evaluation.versionId,
      )
      if (!evaluation) return

      mutate(
        (prev) => ({
          ...(prev ?? {}),
          [args.providerLog.documentLogUuid!]: [
            { result: args.result, evaluation: args.evaluation },
            ...(prev?.[args.providerLog.documentLogUuid!] ?? []),
          ],
        }),
        { revalidate: false },
      )
    },
    [evaluations, mutate],
  )

  useSockets({ event: 'evaluationResultV2Created', onMessage })
}

export default function DocumentEvaluations({
  documentLog,
  document,
  commit,
  runCount,
  isExpanded,
  onToggle,
  isLoading: isDocumentLogLoading,
}: {
  documentLog?: DocumentLogWithMetadata
  document: DocumentVersion
  commit: ICommitContextType['commit']
  runCount: number
  isExpanded?: boolean
  onToggle?: OnToggleFn
  isLoading: boolean
}) {
  const { project } = useCurrentProject()
  const { data: evaluations, isLoading: isEvaluationsV2Loading } =
    useEvaluationsV2({ project, commit, document })

  const { data: evaluationResultsV2, mutate } =
    useEvaluationResultsV2ByDocumentLogs({
      project: project,
      commit: commit,
      document: document,
      documentLogUuids: documentLog ? [documentLog.uuid] : [],
    })

  useEvaluationResultsV2Socket({ evaluations, mutate })

  const results = useMemo(() => {
    if (!documentLog || !evaluationResultsV2[documentLog.uuid]) return {}
    return evaluationResultsV2[documentLog.uuid]!.reduce(
      (acc, { result }) => ({
        ...acc,
        [result.evaluationUuid]: {
          ...result,
          documentLogUuid: documentLog.uuid,
        },
      }),
      {} as Record<string, EvaluationResultV2 & { documentLogUuid: string }>,
    )
  }, [evaluationResultsV2, documentLog])

  const [snapshot, setSnapshot] = useState<Snapshot>()
  const liveEvaluations = useMemo(
    () => evaluations.filter((evaluation) => evaluation.evaluateLiveLogs),
    [evaluations],
  )

  const snapshotDocumentLogId = snapshot?.documentLog.id
  useEffect(() => {
    if (!documentLog || snapshotDocumentLogId === documentLog.id) return

    setSnapshot({
      documentLog,
      evaluations: liveEvaluations,
    })
  }, [documentLog, liveEvaluations, snapshotDocumentLogId])

  const isWaiting = useMemo(
    () =>
      snapshot &&
      !snapshot.evaluations.every(
        (e) => results[e.uuid]?.documentLogUuid === snapshot.documentLog.uuid,
      ),
    [snapshot, results],
  )

  const props = useMemo<SharedProps>(
    () => ({
      results,
      evaluations,
      document,
      commit,
      project,
      runCount,
      isLoading: isEvaluationsV2Loading,
      isWaiting: isWaiting || isDocumentLogLoading,
      documentLog,
    }),
    [
      results,
      evaluations,
      document,
      commit,
      project,
      runCount,
      isEvaluationsV2Loading,
      isWaiting,
      isDocumentLogLoading,
      documentLog,
    ],
  )

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Evaluations'
        icon='listCheck'
        isExpanded={isExpanded}
        onToggle={onToggle}
        collapsedContentHeader={<CollapsedContentHeader {...props} />}
        expandedContent={<ExpandedContent {...props} />}
        expandedContentHeader={<ExpandedContentHeader {...props} />}
      />
    </ClientOnly>
  )
}
