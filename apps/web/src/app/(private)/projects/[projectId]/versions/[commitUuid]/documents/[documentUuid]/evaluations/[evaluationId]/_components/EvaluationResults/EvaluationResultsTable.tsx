import { forwardRef } from 'react'
import { capitalize } from 'lodash-es'

import {
  DEFAULT_PAGINATION_SIZE,
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
} from '@latitude-data/core/browser'
import { buildPagination } from '@latitude-data/core/lib/pagination/buildPagination'
import { EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
import {
  Badge,
  Checkbox,
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
import { SelectableRowsHook } from '$/hooks/useSelectableRows'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import useEvaluationResultsPagination from '$/stores/useEvaluationResultsCount'
import { useSearchParams } from 'next/navigation'

const countLabel = (selected: number) => (count: number) => {
  return selected
    ? `${selected} of ${count} evaluation results selected`
    : `${count} evaluation results`
}

export const ResultCellContent = ({
  evaluation,
  value,
}: {
  evaluation: EvaluationDto
  value: EvaluationResultDto['result']
}) => {
  if (value === undefined) {
    return <Badge variant='secondary'>Pending</Badge>
  }

  if (evaluation.resultType === EvaluationResultableType.Boolean) {
    value = typeof value === 'string' ? value === 'true' : Boolean(value)

    return (
      <Badge variant={value ? 'success' : 'destructive'}>{String(value)}</Badge>
    )
  }

  if (evaluation.resultType === EvaluationResultableType.Number) {
    value = Number(value)
    const minValue = evaluation.resultConfiguration.minValue
    const maxValue = evaluation.resultConfiguration.maxValue

    return <RangeBadge value={value} minValue={minValue} maxValue={maxValue} />
  }

  value = String(value)

  return (
    <Text.H4 noWrap>
      {value.length > 30 ? `${value.slice(0, 30)}...` : value}
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
  selectableState: SelectableRowsHook
}
export const EvaluationResultsTable = forwardRef<HTMLTableElement, Props>(
  function EvaluationResultsTable(
    {
      evaluation,
      evaluationResults,
      selectedResult,
      setSelectedResult,
      selectableState: {
        headerState,
        isSelected,
        toggleRow,
        toggleAll,
        selectedCount,
      },
    },
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
            countLabel={countLabel(selectedCount)}
          />
        }
      >
        <TableHeader className='isolate sticky top-0 z-10'>
          <TableRow>
            <TableHead>
              <Checkbox checked={headerState} onCheckedChange={toggleAll} />
            </TableHead>
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
                <TableCell preventDefault align='left'>
                  <Checkbox
                    fullWidth={false}
                    disabled={!!error}
                    checked={error ? false : isSelected(evaluationResult.id)}
                    onCheckedChange={(checked) =>
                      toggleRow(evaluationResult.id, checked)
                    }
                  />
                </TableCell>
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
