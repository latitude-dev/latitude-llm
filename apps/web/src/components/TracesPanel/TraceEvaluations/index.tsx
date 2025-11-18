import { useMemo } from 'react'
import Link from 'next/link'
import {
  IProjectContextType,
  useCurrentProject,
} from '$/app/providers/ProjectProvider'
import { useEvaluationEditorLink } from '$/lib/useEvaluationEditorLink'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  EVALUATION_SPECIFICATIONS,
  getEvaluationMetricSpecification,
} from '$/components/evaluations'
import {
  DocumentVersion,
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'
import { MetadataItem } from '$/components/MetadataItem'
import ResultBadge from '$/components/evaluations/ResultBadge'
import { ROUTES } from '$/services/routes'
import { useCurrentCommit } from '$/app/providers/CommitProvider'

type Props<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = ResultWithEvaluationV2<T, M> & {
  project: IProjectContextType['project']
  commit: Commit
  document: Pick<DocumentVersion, 'commitId' | 'documentUuid'>
}

function EvaluatedLogLinkV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({ result, evaluation, project, commit, document }: Props<T, M>) {
  const query = new URLSearchParams()
  query.set('resultUuid', result.uuid)

  return (
    ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid })
      .documents.detail({ uuid: document.documentUuid })
      .evaluations.detail({ uuid: evaluation.uuid }).root +
    `?${query.toString()}`
  )
}

function TraceEvaluation<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  result,
  evaluation,
}: {
  result: Props<T, M>['result']
  evaluation: Props<T, M>['evaluation']
}) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  const metricSpecification = typeSpecification.metrics[evaluation.metric]
  if (!metricSpecification) return null

  return (
    <div className='flex flex-col gap-2.5'>
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
          <MetadataItem
            label='Reasoning'
            value={
              metricSpecification.resultReason(
                result as EvaluationResultSuccessValue<T, M>,
              ) || 'No reason reported'
            }
            stacked
            collapsible
          />
        </>
      )}
    </div>
  )
}

export function TraceEvaluations({
  documentUuid,
  span,
  results,
}: {
  documentUuid: string
  span: SpanWithDetails<SpanType> | undefined
  results: ResultWithEvaluationV2[]
}) {
  const { commit } = useCurrentCommit()
  const document = useMemo(
    () => ({ documentUuid, commitId: commit.id }),
    [documentUuid, commit.id],
  )
  const { project } = useCurrentProject()
  const getEvaluationV2Url = useEvaluationEditorLink({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
  })

  if (!results.length) {
    return (
      <div className='w-full flex items-center justify-center'>
        <Text.H5 color='foregroundMuted' centered>
          There are no evaluation results for this log
        </Text.H5>
      </div>
    )
  }

  return (
    <ul className='flex flex-col gap-4 divide-y divide-border'>
      {results.map((item) => (
        <li
          key={item.result.uuid}
          className='flex flex-col gap-2 pt-4 first:pt-0'
        >
          <span className='flex justify-between items-center gap-2 w-full'>
            <span className='flex justify-center items-center gap-1.5'>
              <Icon
                name={getEvaluationMetricSpecification(item.evaluation).icon}
                color='foreground'
                className='flex-shrink-0'
              />
              <Text.H4M noWrap ellipsis>
                {item.evaluation.name}
              </Text.H4M>
            </span>
            <Link
              href={getEvaluationV2Url({
                evaluationUuid: item.evaluation.uuid,
                documentLogUuid: span?.documentLogUuid,
              })}
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
          <TraceEvaluation result={item.result} evaluation={item.evaluation} />
          <div className='w-full flex justify-start pt-2'>
            <Link
              href={EvaluatedLogLinkV2({
                project: project,
                commit: commit,
                document: document,
                ...item,
              })}
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
