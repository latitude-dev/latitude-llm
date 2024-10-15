import { capitalize } from 'lodash-es'

import {
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { IPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
import {
  Badge,
  cn,
  Icon,
  RangeBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import { formatCostInMillicents, relativeTime } from '$/app/_lib/formatUtils'
import { getEnsureEvaluationResultError } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_lib/getEnsureEvaluationResultError'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'

function countLabel(count: number) {
  return `${count} evaluation results`
}

function ErrorCell({
  error,
}: {
  error: EvaluationResultWithMetadataAndErrors['error']
}) {
  return (
    <Tooltip
      variant='destructive'
      trigger={
        <div className='flex flex-row items-center gap-x-2'>
          <Text.H5 color='destructive'>-</Text.H5>
          <Icon name='alert' color='destructive' />
        </div>
      }
    >
      <Text.H6B color='white'>{error.message}</Text.H6B>
    </Tooltip>
  )
}

export const ResultCellContent = ({
  evaluation,
  value,
}: {
  evaluation: EvaluationDto
  value: unknown
}) => {
  if (evaluation.configuration.type === EvaluationResultableType.Boolean) {
    return (
      <Badge variant={(value as boolean) ? 'success' : 'destructive'}>
        {String(value)}
      </Badge>
    )
  }

  if (evaluation.configuration.type === EvaluationResultableType.Number) {
    const minValue = evaluation.configuration.detail?.range.from ?? 0
    const maxValue = evaluation.configuration.detail?.range.to ?? 10

    return (
      <RangeBadge
        value={Number(value)}
        minValue={minValue}
        maxValue={maxValue}
      />
    )
  }

  return <Text.H4 noWrap>{value as string}</Text.H4>
}

export type EvaluationResultRow = EvaluationResultWithMetadataAndErrors & {
  realtimeAdded?: boolean
}
export const EvaluationResultsTable = ({
  evaluation,
  pagination,
  evaluationResults,
  selectedResult,
  setSelectedResult,
}: {
  evaluation: EvaluationDto
  pagination: IPagination
  evaluationResults: EvaluationResultRow[]
  selectedResult: EvaluationResultRow | undefined
  setSelectedResult: (
    log: EvaluationResultWithMetadataAndErrors | undefined,
  ) => void
}) => {
  return (
    <Table
      className='table-auto'
      externalFooter={
        <LinkableTablePaginationFooter
          pagination={pagination}
          countLabel={countLabel}
        />
      }
    >
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Origin</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {evaluationResults.map((evaluationResult, index) => {
          const error = getEnsureEvaluationResultError(evaluationResult.error)
          const cellColor = error ? 'destructive' : 'foreground'
          return (
            <TableRow
              key={`${evaluationResult.id}-${index}`}
              onClick={() =>
                setSelectedResult(
                  selectedResult?.id === evaluationResult.id
                    ? undefined
                    : evaluationResult,
                )
              }
              className={cn(
                'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border',
                {
                  'bg-secondary': selectedResult?.id === evaluationResult.id,
                  'animate-flash': evaluationResult.realtimeAdded,
                },
              )}
            >
              <TableCell>
                <Text.H5 noWrap color={cellColor}>
                  <time
                    dateTime={evaluationResult.createdAt.toISOString()}
                    suppressHydrationWarning
                  >
                    {relativeTime(evaluationResult.createdAt)}
                  </time>
                </Text.H5>
              </TableCell>
              <TableCell>
                <div className='flex flex-row gap-2 items-center'>
                  <Badge
                    variant={
                      evaluationResult.commit.version ? 'accent' : 'muted'
                    }
                    shape='square'
                  >
                    <Text.H6 noWrap>
                      {evaluationResult.commit.version
                        ? `v${evaluationResult.commit.version}`
                        : 'Draft'}
                    </Text.H6>
                  </Badge>
                  <Text.H5 color={cellColor}>
                    {evaluationResult.commit.title}
                  </Text.H5>
                </div>
              </TableCell>
              <TableCell>
                <Text.H5 noWrap color={cellColor}>
                  {evaluationResult.source
                    ? capitalize(evaluationResult.source)
                    : '-'}
                </Text.H5>
              </TableCell>
              <TableCell>
                {error ? (
                  <ErrorCell error={error} />
                ) : evaluationResult.result !== null ? (
                  <ResultCellContent
                    evaluation={evaluation}
                    value={evaluationResult.result}
                  />
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                <Text.H5 noWrap color={cellColor}>
                  {typeof evaluationResult.costInMillicents === 'number'
                    ? formatCostInMillicents(evaluationResult.costInMillicents)
                    : '-'}
                </Text.H5>
              </TableCell>
              <TableCell>
                <Text.H5 noWrap color={cellColor}>
                  {evaluationResult.tokens ?? '-'}
                </Text.H5>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
