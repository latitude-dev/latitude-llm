import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import {
  ResultRowCells,
  ResultRowHeaders,
} from '$/components/evaluations/ResultRow'
import { LinkableTablePaginationFooter } from '$/components/TablePaginationFooter'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useEvaluationResultsV2Pagination } from '$/stores/evaluationResultsV2'
import {
  Commit,
  DEFAULT_PAGINATION_SIZE,
  EvaluationMetric,
  EvaluationResultsV2Search,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '@latitude-data/core/browser'
import {
  Checkbox,
  cn,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { Ref } from 'react'

function EvaluationResultsTableRow<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  evaluation,
  result,
  selectedResult,
  setSelectedResult,
  commits,
  selectableState: { isSelected, toggleRow },
}: {
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2<T, M>
  selectedResult?: EvaluationResultV2<T, M>
  setSelectedResult: (result?: EvaluationResultV2<T, M>) => void
  commits: Record<number, Commit>
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
        commit={commits[result.commitId]!}
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
    ? `${selected} of ${count} evaluation results selected`
    : `${count} evaluation results`
}

export function EvaluationResultsTableBody<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  results,
  selectedResult,
  setSelectedResult,
  commits,
  selectableState,
  search,
  isLoading,
  ref,
}: {
  results: EvaluationResultV2<T, M>[]
  selectedResult?: EvaluationResultV2<T, M>
  setSelectedResult: (result?: EvaluationResultV2<T, M>) => void
  commits: Record<number, Commit>
  selectableState: ReturnType<typeof useSelectableRows>
  search: EvaluationResultsV2Search
  isLoading: boolean
  ref: Ref<HTMLTableElement>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const { data: pagination, isLoading: isPaginationLoading } =
    useEvaluationResultsV2Pagination({
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
        <LinkableTablePaginationFooter
          isLoading={isLoading || isPaginationLoading}
          pagination={pagination}
          countLabel={countLabel(selectableState.selectedCount)}
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
            >
              <TableCell align='left'>
                <Checkbox fullWidth={false} disabled={true} />
              </TableCell>
              <Skeleton className='h-5 w-[90%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
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
              commits={commits}
              selectableState={selectableState}
            />
          ))}
      </TableBody>
    </Table>
  )
}
