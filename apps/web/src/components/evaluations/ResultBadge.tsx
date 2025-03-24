import { EvaluationMetric, EvaluationType } from '@latitude-data/constants'
import { Badge, Tooltip } from '@latitude-data/web-ui'
import { EVALUATION_SPECIFICATIONS, ResultBadgeProps } from './index'

export default function ResultBadge<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({ evaluation, result }: ResultBadgeProps<T, M>) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  if (result.error) {
    return (
      <Tooltip asChild trigger={<Badge variant='warningMuted'>Error</Badge>}>
        Evaluation {evaluation.name} failed with the following error:{' '}
        {result.error.message}
      </Tooltip>
    )
  }

  return (
    <Tooltip
      asChild
      trigger={
        <Badge variant={result.hasPassed ? 'successMuted' : 'destructiveMuted'}>
          <typeSpecification.ResultBadge
            metric={evaluation.metric}
            evaluation={evaluation}
            result={result}
          />
        </Badge>
      }
    >
      Evaluation {evaluation.name}, with a score of {result.score} (
      {result.metadata!.configuration.reverseScale
        ? 'lower is better'
        : 'higher is better'}
      ), did {result.hasPassed ? 'pass' : 'not pass'}
    </Tooltip>
  )
}
