import { forwardRef } from 'react'
import { capitalize } from 'lodash-es'

import {
  DEFAULT_PAGINATION_SIZE,
  EvaluationDto,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
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
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useEvaluationResultsPagination from '$/stores/useEvaluationResultsCount'
import { useSearchParams } from 'next/navigation'

function countLabel(count: number) {
  return `${count} evaluation results`
}

export const ResultCellContent = ({
  evaluation,
  value,
}: {
  evaluation: EvaluationDto
  value: unknown
}) => {
  if (evaluation.resultType === EvaluationResultableType.Boolean) {
    return (
      <Badge variant={value === 'true' ? 'success' : 'destructive'}>
        {String(value)}
      </Badge>
    )
  }

  if (evaluation.resultType === EvaluationResultableType.Number) {
    const minValue = evaluation.resultConfiguration.minValue
    const maxValue = evaluation.resultConfiguration.maxValue

    return (
      <RangeBadge
        value={Number(value)}
        minValue={minValue}
        maxValue={maxValue}
      />
    )
  }

  return (
    <Text.H4 noWrap>
      {typeof value === 'string' && value.length > 30
        ? `${value.slice(0, 30)}...`
        : (value as string)}
    </Text.H4>
  )
}

export type EvaluationResultRow = EvaluationResultWithMetadataAndErrors & {
  realtimeAdded?: boolean
}
type Props = {
  evaluation: EvaluationDto
  evaluationResults: EvaluationResultRow[]
  selectedResult: EvaluationResultRow | undefined
  setSelectedResult: (
    log: EvaluationResultWithMetadataAndErrors | undefined,
  ) => void
}
export const EvaluationResultsTable = forwardRef<HTMLTableElement, Props>(
  function EvaluationResultsTable(
    { evaluation, evaluationResults, selectedResult, setSelectedResult },
    ref,
  ) {
    const searchParams = useSearchParams()
    const page = searchParams.get('page') ?? '1'
    const pageSize =
      searchParams.get('pageSize') ?? String(DEFAULT_PAGINATION_SIZE)
    const document = useCurrentDocument()
    const { commit } = useCurrentCommit()
    const { project } = useCurrentProject()
    const { data: pagination, isLoading } = useEvaluationResultsPagination({
      evaluationId: evaluation.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
      page,
      pageSize,
    })

    return (
      <Table
        ref={ref}
        className='table-auto'
        externalFooter={
          <LinkableTablePaginationFooter
            isLoading={isLoading}
            pagination={
              pagination
                ? buildPagination({
                    baseUrl: ROUTES.projects
                      .detail({ id: project.id })
                      .commits.detail({ uuid: commit.uuid })
                      .documents.detail({ uuid: document.documentUuid })
                      .evaluations.detail(evaluation.id).root,
                    count: pagination.count,
                    page: Number(page),
                    pageSize: Number(pageSize),
                  })
                : undefined
            }
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
          {evaluationResults.map((evaluationResult) => {
            const error = getRunErrorFromErrorable(evaluationResult.error)
            const cellColor = error
              ? 'destructiveMutedForeground'
              : 'foreground'
            return (
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
                  {evaluationResult.result !== null ? (
                    <ResultCellContent
                      evaluation={evaluation}
                      value={evaluationResult.result}
                    />
                  ) : (
                    <Text.H5 color={cellColor}> - </Text.H5>
                  )}
                </TableCell>
                <TableCell>
                  <Text.H5 noWrap color={cellColor}>
                    {typeof evaluationResult.costInMillicents === 'number'
                      ? formatCostInMillicents(
                          evaluationResult.costInMillicents,
                        )
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
  },
)
