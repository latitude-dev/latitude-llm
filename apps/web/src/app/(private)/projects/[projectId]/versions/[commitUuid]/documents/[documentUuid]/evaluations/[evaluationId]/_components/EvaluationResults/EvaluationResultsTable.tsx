import {
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { EvaluationResultWithMetadata } from '@latitude-data/core/repositories'
import {
  Badge,
  cn,
  RangeBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@latitude-data/web-ui'
import { formatCostInMillicents, relativeTime } from '$/app/_lib/formatUtils'

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

type EvaluationResultRow = EvaluationResultWithMetadata & {
  realtimeAdded?: boolean
}
export const EvaluationResultsTable = ({
  evaluation,
  evaluationResults,
  selectedResult,
  setSelectedResult,
}: {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultRow[]
  selectedResult: EvaluationResultRow | undefined
  setSelectedResult: (log: EvaluationResultWithMetadata | undefined) => void
}) => {
  return (
    <Table className='table-auto'>
      <TableHeader className='sticky top-0 z-10'>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Tokens</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className='max-h-full overflow-y-auto'>
        {evaluationResults.map((evaluationResult) => (
          <TableRow
            key={evaluationResult.id}
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
              <Text.H4 noWrap>
                <time
                  dateTime={evaluationResult.createdAt.toISOString()}
                  suppressHydrationWarning
                >
                  {relativeTime(evaluationResult.createdAt)}
                </time>
              </Text.H4>
            </TableCell>
            <TableCell>
              <div className='flex flex-row gap-2 items-center'>
                <Badge
                  variant={evaluationResult.commit.version ? 'accent' : 'muted'}
                  shape='square'
                >
                  <Text.H6 noWrap>
                    {evaluationResult.commit.version
                      ? `v${evaluationResult.commit.version}`
                      : 'Draft'}
                  </Text.H6>
                </Badge>
                <Text.H5>{evaluationResult.commit.title}</Text.H5>
              </div>
            </TableCell>
            <TableCell>
              <ResultCellContent
                evaluation={evaluation}
                value={evaluationResult.result}
              />
            </TableCell>
            <TableCell>
              <Text.H4 noWrap>
                {formatCostInMillicents(evaluationResult.costInMillicents || 0)}
              </Text.H4>
            </TableCell>
            <TableCell>
              <Text.H4 noWrap>{evaluationResult.tokens}</Text.H4>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
