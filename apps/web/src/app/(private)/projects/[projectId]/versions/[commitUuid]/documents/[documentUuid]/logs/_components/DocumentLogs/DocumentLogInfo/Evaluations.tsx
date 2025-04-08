import {
  evaluationMetadataTypes,
  evaluationResultTypes,
} from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { EVALUATION_SPECIFICATIONS } from '$/components/evaluations'
import ResultBadge from '$/components/evaluations/ResultBadge'
import { EvaluationRoutes, ROUTES } from '$/services/routes'
import {
  Commit,
  EvaluationMetadataType,
  EvaluationMetric,
  EvaluationResultableType,
  EvaluationResultV2,
  EvaluationType,
  ResultWithEvaluation,
  ResultWithEvaluationTmp,
  ResultWithEvaluationV2,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import Link from 'next/link'
import { MetadataItem } from '../../../../_components/MetadataItem'
import { ResultCellContent } from '../../../../evaluations/[evaluationId]/_components/EvaluationResults/EvaluationResultsTable'

type Props<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = ResultWithEvaluationV2<T, M> & { commit: Commit }

function EvaluationResultItem({ result, evaluation }: ResultWithEvaluation) {
  if (result.resultableType === EvaluationResultableType.Text) {
    return (
      <Text.H5 align='left' color='foregroundMuted'>
        {result.result || '-'}
      </Text.H5>
    )
  }

  return <ResultCellContent evaluation={evaluation} value={result.result} />
}

function evaluatedLogLinkV1({ result, evaluation }: ResultWithEvaluation) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const query = new URLSearchParams()

  if (evaluation.metadataType === EvaluationMetadataType.Manual) {
    query.set('documentLogId', result.documentLogId.toString())
  } else {
    query.set('resultUuid', result.uuid)
  }

  return (
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluations.detail(evaluation.id).root + `?${query.toString()}`
  )
}

function evaluatedLogLinkV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ result, evaluation, commit }: Props<T, M>) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  const query = new URLSearchParams()
  query.set('resultUuid', result.uuid)

  return (
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluationsV2.detail({ uuid: evaluation.uuid }).root +
    `?${query.toString()}`
  )
}

function evaluationEditorLinkV1({ result, evaluation }: ResultWithEvaluation) {
  const query = new URLSearchParams()
  if (result.evaluatedProviderLogId) {
    query.set('providerLogId', result.evaluatedProviderLogId.toString())
  }

  return (
    ROUTES.evaluations.detail({ uuid: evaluation.uuid })[
      EvaluationRoutes.editor
    ].root + `?${query.toString()}`
  )
}

function evaluationEditorLinkV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ evaluation, commit }: Props<T, M>) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  // TODO(evalsv2): Go to LLM evaluation editor when LLM V2 evaluations are available
  return ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commit.uuid })
    .documents.detail({ uuid: document.documentUuid })
    .evaluationsV2.detail({ uuid: evaluation.uuid }).root
}

function DocumentLogEvaluationsV1({
  result,
  evaluation,
}: ResultWithEvaluation) {
  return (
    <>
      <MetadataItem
        label='Type'
        value={`${evaluationResultTypes[evaluation.resultType]} - ${evaluationMetadataTypes[evaluation.metadataType]}`}
      />
      <MetadataItem label='Result' stacked>
        <EvaluationResultItem result={result} evaluation={evaluation} />
      </MetadataItem>
      <MetadataItem
        stacked
        label='Reasoning'
        value={result.reason || 'No reason reported'}
      />
    </>
  )
}

function DocumentLogEvaluationsV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ result, evaluation }: Props<T, M>) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  const metricSpecification = typeSpecification.metrics[evaluation.metric]

  return (
    <>
      <MetadataItem label='Type' value={typeSpecification.name} />
      <MetadataItem label='Metric' value={metricSpecification.name} />
      {result.error ? (
        <MetadataItem
          label='Error'
          value={result.error.message}
          color='destructiveMutedForeground'
          stacked
        />
      ) : (
        <>
          <MetadataItem label='Result'>
            <ResultBadge evaluation={evaluation} result={result} />
          </MetadataItem>
          {(evaluation.type === EvaluationType.Llm ||
            evaluation.type === EvaluationType.Human) && (
            <MetadataItem
              label='Reasoning'
              value={
                (
                  result as EvaluationResultV2<
                    EvaluationType.Llm | EvaluationType.Human
                  >
                ).metadata!.reason || 'No reason reported'
              }
              stacked
            />
          )}
        </>
      )}
    </>
  )
}

export function DocumentLogEvaluations({
  evaluationResults = [],
  commit,
}: {
  evaluationResults?: ResultWithEvaluationTmp[]
  commit: Commit
}) {
  if (!evaluationResults.length) {
    return (
      <Text.H5 color='foregroundMuted' centered>
        There are no evaluation results for this log
      </Text.H5>
    )
  }

  return (
    <ul className='flex flex-col gap-4 divide-y divide-border'>
      {evaluationResults.map((item) => (
        <li
          key={item.result.uuid}
          className='flex flex-col gap-2 pt-4 first:pt-0'
        >
          <span className='flex justify-between items-center gap-2 w-full'>
            <Text.H4M noWrap ellipsis>
              {item.evaluation.name}
            </Text.H4M>
            <Link
              href={
                item.version === 'v2'
                  ? evaluationEditorLinkV2({ ...item, commit })
                  : evaluationEditorLinkV1(item)
              }
              target='_blank'
            >
              <Button
                variant='link'
                iconProps={{
                  name: 'externalLink',
                  widthClass: 'w-4',
                  heightClass: 'h-4',
                  placement: 'right',
                }}
              >
                Edit
              </Button>
            </Link>
          </span>
          <div className='flex flex-col gap-2.5'>
            {item.version === 'v2' ? (
              <DocumentLogEvaluationsV2 {...item} commit={commit} />
            ) : (
              <DocumentLogEvaluationsV1 {...item} />
            )}
          </div>
          <div className='w-full flex justify-start pt-2'>
            <Link
              href={
                item.version === 'v2'
                  ? evaluatedLogLinkV2({ ...item, commit })
                  : evaluatedLogLinkV1(item)
              }
              target='_blank'
            >
              <Button variant='outline' fancy>
                View log
              </Button>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}
