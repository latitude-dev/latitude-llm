import { relativeTime } from '$/lib/relativeTime'
import type { EvaluationMetric, EvaluationType } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { TableCell, TableHead } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  EVALUATION_SPECIFICATIONS,
  type ResultRowCellsProps,
  type ResultRowHeadersProps,
} from './index'
import ResultBadge from './ResultBadge'

export function ResultRowHeaders<T extends EvaluationType, M extends EvaluationMetric<T>>({
  evaluation,
  ...rest
}: ResultRowHeadersProps<T, M>) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  return (
    <>
      <TableHead>Time</TableHead>
      <TableHead>Version</TableHead>
      <TableHead>Result</TableHead>
      {!!typeSpecification.ResultRowHeaders && (
        <typeSpecification.ResultRowHeaders
          metric={evaluation.metric}
          evaluation={evaluation}
          {...rest}
        />
      )}
    </>
  )
}

export function ResultRowCells<T extends EvaluationType, M extends EvaluationMetric<T>>({
  evaluation,
  result,
  commit,
  color,
  ...rest
}: ResultRowCellsProps<T, M>) {
  const typeSpecification = EVALUATION_SPECIFICATIONS[evaluation.type]
  if (!typeSpecification) return null

  return (
    <>
      <TableCell>
        <Text.H5 noWrap color={color}>
          <time dateTime={new Date(result.createdAt).toISOString()}>
            {relativeTime(new Date(result.createdAt))}
          </time>
        </Text.H5>
      </TableCell>
      <TableCell>
        <span className='flex flex-row gap-2 items-center truncate'>
          <Badge variant={commit.version ? 'accent' : 'muted'} className='flex-shrink-0'>
            <Text.H6 noWrap>{commit.version ? `v${commit.version}` : 'Draft'}</Text.H6>
          </Badge>
          <Text.H5 color={color} noWrap ellipsis>
            {commit.title}
          </Text.H5>
        </span>
      </TableCell>
      <TableCell>
        {result.error ? (
          <Text.H5 color={color}>-</Text.H5>
        ) : (
          <ResultBadge evaluation={evaluation} result={result} />
        )}
      </TableCell>
      {!!typeSpecification.ResultRowCells && (
        <typeSpecification.ResultRowCells
          metric={evaluation.metric}
          evaluation={evaluation}
          result={result}
          commit={commit}
          color={color}
          {...rest}
        />
      )}
    </>
  )
}
