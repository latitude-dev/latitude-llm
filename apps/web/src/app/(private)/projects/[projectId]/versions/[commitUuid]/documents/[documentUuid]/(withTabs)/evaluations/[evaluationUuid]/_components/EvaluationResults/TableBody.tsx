import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  ResultRowCells,
  ResultRowHeaders,
} from '$/components/evaluations/ResultRow'
import { LogicTablePaginationFooter } from '$/components/TablePaginationFooter/LogicTablePaginationFooter'
import { useSelectableRows } from '$/hooks/useSelectableRows'
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
import { cn } from '@latitude-data/web-ui/utils'
import { Ref } from 'react'
import {
  DEFAULT_PAGINATION_SIZE,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/constants'
import { EvaluationResultsV2Search } from '@latitude-data/core/helpers'
import { EvaluationResultV2WithDetails } from '@latitude-data/core/schema/types'

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
        onClick={() => {
          if (result.error) return
          toggleRow(result.uuid, !isSelected(result.uuid))
        }}
        className={cn({
          'pointer-events-none cursor-wait': !!result.error,
        })}
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
  totalResults,
  selectedResult,
  setSelectedResult,
  selectableState,
  search,
  setSearch,
  isLoading,
  ref,
}: {
  results: EvaluationResultV2WithDetails<T, M>[]
  totalResults: number
  selectedResult?: EvaluationResultV2WithDetails<T, M>
  setSelectedResult: (result?: EvaluationResultV2WithDetails<T, M>) => void
  selectableState: ReturnType<typeof useSelectableRows>
  search: EvaluationResultsV2Search
  setSearch: (search: EvaluationResultsV2Search) => void
  isLoading?: boolean
  ref: Ref<HTMLTableElement>
}) {
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  return (
    <Table
      ref={ref}
      className='table-auto'
      externalFooter={
        <LogicTablePaginationFooter
          page={search.pagination.page}
          pageSize={search.pagination.pageSize}
          count={totalResults}
          countLabel={countLabel(selectableState.selectedCount)}
          onPageChange={(page) =>
            setSearch({ ...search, pagination: { ...search.pagination, page } })
          }
          isLoading={isLoading}
        />
      }
    >
      <TableHeader className='isolate sticky top-0 z-10'>
        <TableRow>
          <TableHead align='left' onClick={selectableState.toggleAll}>
            <Checkbox fullWidth={false} checked={selectableState.headerState} />
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
