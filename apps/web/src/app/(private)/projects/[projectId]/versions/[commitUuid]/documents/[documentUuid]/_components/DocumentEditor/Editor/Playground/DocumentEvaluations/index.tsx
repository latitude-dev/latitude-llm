import { OpenInDocsButton } from '$/components/Documentation/OpenInDocsButton'
import { DocsRoute } from '$/components/Documentation/routes'
import {
  EventArgs,
  useSockets,
} from '$/components/Providers/WebsocketsProvider/useSockets'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  DocumentLogWithMetadata,
  DocumentVersion,
  EvaluationResultV2,
  EvaluationV2,
} from '@latitude-data/core/browser'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import {
  CollapsibleBox,
  OnToggleFn,
} from '@latitude-data/web-ui/molecules/CollapsibleBox'
import {
  ICommitContextType,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCallback, useMemo } from 'react'
import {
  CollapsedContentHeader,
  ExpandedContent,
  ExpandedContentHeader,
} from './BoxContent'

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

  const snapshot = useMemo(() => {
    if (!documentLog) return

    return {
      documentLog,
      evaluations: evaluations.filter((e) => e.evaluateLiveLogs),
    }
  }, [documentLog, evaluations])

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
    isLoading: isEvaluationsV2Loading,
    isWaiting: isWaiting || isDocumentLogLoading,
    documentLog,
  }

  return (
    <ClientOnly>
      <CollapsibleBox
        title='Evaluations'
        icon='listCheck'
        isExpanded={isExpanded}
        onToggle={onToggle}
        collapsedContentHeader={
          <div className='flex flex-row items-center justify-start gap-x-2'>
            <OpenInDocsButton route={DocsRoute.Evaluations} />
            <CollapsedContentHeader {...props} />
          </div>
        }
        expandedContent={<ExpandedContent {...props} />}
        expandedContentHeader={
          <div className='flex flex-row items-center justify-start gap-x-2'>
            <OpenInDocsButton route={DocsRoute.Evaluations} />
            <ExpandedContentHeader {...props} />
          </div>
        }
      />
    </ClientOnly>
  )
}
