import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useConnectedEvaluations from '$/stores/connectedEvaluations'
import useEvaluationResultsByDocumentLogs from '$/stores/evaluationResultsByDocumentLogs'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  ConnectedEvaluation,
  DocumentVersion,
  EvaluationDto,
  EvaluationResultDto,
  EvaluationResultTmp,
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
  useCurrentProject,
  ICommitContextType,
} from '@latitude-data/web-ui/providers'
import {
  CollapsedContentHeader,
  ExpandedContent,
  ExpandedContentHeader,
} from './BoxContent'
import { EvaluationTmp, Snapshot } from './shared'

const useEvaluationResultsSocket = ({
  evaluations,
  mutate,
}: {
  evaluations: (EvaluationDto & { live: ConnectedEvaluation['live'] })[]
  mutate: ReturnType<typeof useEvaluationResultsByDocumentLogs>['mutate']
}) => {
  const onMessage = useCallback(
    (args: EventArgs<'evaluationResultCreated'>) => {
      if (!args?.row?.resultableId || !args?.row?.evaluatedProviderLogId) return
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

  const { data: connectedEvaluations, isLoading: isEvaluationsV1Loading } =
    useConnectedEvaluations({
      documentUuid: document.documentUuid,
      projectId: project.id,
      commitUuid: commit.uuid,
    })
  const evaluationsV1 = useMemo(
    () =>
      connectedEvaluations.map(({ evaluation, live }) => ({
        ...evaluation,
        live,
      })),
    [connectedEvaluations],
  )

  const { data: evaluationsV2, isLoading: isEvaluationsV2Loading } =
    useEvaluationsV2({ project, commit, document })

  const evaluations = useMemo<EvaluationTmp[]>(() => {
    return [
      ...evaluationsV1.map((evaluation) => ({
        ...evaluation,
        version: 'v1' as const,
      })),
      ...evaluationsV2.map((evaluation) => ({
        ...evaluation,
        version: 'v2' as const,
      })),
    ]
  }, [evaluationsV1, evaluationsV2])

  const { data: evaluationResultsV1, mutate: mutateV1 } =
    useEvaluationResultsByDocumentLogs({
      documentLogIds: documentLog ? [documentLog.id] : [],
    })
  useEvaluationResultsSocket({ evaluations: evaluationsV1, mutate: mutateV1 })
  const resultsV1 = useMemo(() => {
    if (!documentLog || !evaluationResultsV1[documentLog.id]) return {}
    return evaluationResultsV1[documentLog.id]!.reduce(
      (acc, { evaluation, result }) => ({
        ...acc,
        [evaluation.uuid]: {
          ...result,
          documentLogUuid: documentLog.uuid,
        },
      }),
      {} as Record<string, EvaluationResultDto & { documentLogUuid: string }>,
    )
  }, [evaluationResultsV1])

  const { data: evaluationResultsV2, mutate: mutateV2 } =
    useEvaluationResultsV2ByDocumentLogs({
      project: project,
      commit: commit,
      document: document,
      documentLogUuids: documentLog ? [documentLog.uuid] : [],
    })
  useEvaluationResultsV2Socket({ evaluations: evaluationsV2, mutate: mutateV2 })
  const resultsV2 = useMemo(() => {
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
  }, [evaluationResultsV2])

  const results = useMemo<
    Record<string, EvaluationResultTmp & { documentLogUuid: string }>
  >(
    () => ({
      ...Object.fromEntries(
        Object.entries(resultsV1).map(([evaluation, result]) => [
          evaluation,
          { ...result, version: 'v1' as const },
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(resultsV2).map(([evaluation, result]) => [
          evaluation,
          { ...result, version: 'v2' as const },
        ]),
      ),
    }),
    [resultsV1, resultsV2],
  )

  const [snapshot, setSnapshot] = useState<Snapshot>()
  useEffect(() => {
    if (!documentLog || snapshot?.documentLog.id === documentLog.id) return
    setSnapshot({
      documentLog: documentLog,
      evaluations: evaluations.filter(
        (evaluation) =>
          (evaluation.version === 'v1' && evaluation.live) ||
          (evaluation.version === 'v2' && evaluation.evaluateLiveLogs),
      ),
    })
  }, [documentLog])

  const isWaiting = useMemo(
    () =>
      snapshot &&
      !snapshot.evaluations.every(
        (e) => results[e.uuid]?.documentLogUuid === snapshot.documentLog.uuid,
      ),
    [snapshot, results],
  )

  const props = {
    results,
    evaluations,
    document,
    commit,
    project,
    runCount,
    isLoading: isEvaluationsV1Loading || isEvaluationsV2Loading,
    isWaiting: isWaiting || isDocumentLogLoading,
  }

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
