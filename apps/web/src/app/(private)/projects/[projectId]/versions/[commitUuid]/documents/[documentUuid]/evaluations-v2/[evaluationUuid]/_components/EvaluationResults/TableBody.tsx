import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  ResultRowCells,
  ResultRowHeaders,
} from '$/components/evaluations/ResultRow'
import { LogicTablePaginationFooter } from '$/components/TablePaginationFooter/LogicTablePaginationFooter'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useEvaluationResultsV2Count } from '$/stores/evaluationResultsV2'
import {
  DEFAULT_PAGINATION_SIZE,
  EvaluationMetric,
  EvaluationResultsV2Search,
  EvaluationResultV2WithDetails,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/browser'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import { Ref } from 'react'

function EvaluationResultsTableRow<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  evaluation,
  result,
  selectedResult,
  setSelectedResult,
  selectableState: { isSelected, toggleRow },
}: {
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2WithDetails<T, M>
  selectedResult?: EvaluationResultV2WithDetails<T, M>
  setSelectedResult: (result?: EvaluationResultV2WithDetails<T, M>) => void
  selectableState: ReturnType<typeof useSelectableRows>
}) {
  return (
    <TableRow
      onClick={() =>
        setSelectedResult(
          result.uuid === selectedResult?.uuid ? undefined : result,
        )
      }
      className={cn(
        'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border transition-colors',
        {
          'bg-secondary': result.uuid === selectedResult?.uuid,
          'bg-accent': (result as any).realtimeAdded,
        },
      )}
    >
      <TableCell
        preventDefault
        align='left'
        onClick={() => toggleRow(result.uuid, !isSelected(result.uuid))}
      >
        <Checkbox
          fullWidth={false}
          disabled={!!result.error}
          checked={result.error ? false : isSelected(result.uuid)}
        />
      </TableCell>
      <ResultRowCells
        evaluation={evaluation}
        result={result}
        commit={result.commit}
        color={
          result.error
            ? 'destructiveMutedForeground'
            : (result as any).realtimeAdded
              ? 'accentForeground'
              : 'foreground'
        }
      />
    </TableRow>
  )
}

const countLabel = (selected: number) => (count: number) => {
  return selected
    ? `${selected} of ${count} results selected`
    : `${count} results`
}

export function EvaluationResultsTableBody<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  results,
  selectedResult,
  setSelectedResult,
  selectableState,
  search,
  setSearch,
  isLoading,
  ref,
}: {
  results: EvaluationResultV2WithDetails<T, M>[]
  selectedResult?: EvaluationResultV2WithDetails<T, M>
  setSelectedResult: (result?: EvaluationResultV2WithDetails<T, M>) => void
  selectableState: ReturnType<typeof useSelectableRows>
  search: EvaluationResultsV2Search
  setSearch: (search: EvaluationResultsV2Search) => void
  isLoading?: boolean
  ref: Ref<HTMLTableElement>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const { data: count, isLoading: isCountLoading } =
    useEvaluationResultsV2Count({
      project: project,
      commit: commit,
      document: document,
      evaluation: evaluation,
      search: search,
    })

  return (
    <Table
      ref={ref}
      className='table-auto'
      externalFooter={
        <LogicTablePaginationFooter
          page={search.pagination.page}
          pageSize={search.pagination.pageSize}
          count={count}
          countLabel={countLabel(selectableState.selectedCount)}
          onPageChange={(page) =>
            setSearch({ ...search, pagination: { ...search.pagination, page } })
          }
          isLoading={isLoading || isCountLoading}
        />
      }
    >
      <TableHeader className='isolate sticky top-0 z-10'>
        <TableRow>
          <TableHead>
            <Checkbox
              checked={selectableState.headerState}
              onCheckedChange={selectableState.toggleAll}
            />
          </TableHead>
          <ResultRowHeaders evaluation={evaluation} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: DEFAULT_PAGINATION_SIZE }).map((_, index) => (
            <TableRow
              key={index}
              className='border-b-[0.5px] h-12 max-h-12 border-border relative'
              hoverable={false}
            >
              <TableCell align='left'>
                <Checkbox fullWidth={false} disabled={true} />
              </TableCell>
              <TableCell>
                <Skeleton className='h-5 w-[90%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
              </TableCell>
            </TableRow>
          ))}
        {!isLoading &&
          results.map((result) => (
            <EvaluationResultsTableRow
              key={result.uuid}
              evaluation={evaluation}
              result={result}
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
              selectableState={selectableState}
            />
          ))}
      </TableBody>
    </Table>
  )
}
