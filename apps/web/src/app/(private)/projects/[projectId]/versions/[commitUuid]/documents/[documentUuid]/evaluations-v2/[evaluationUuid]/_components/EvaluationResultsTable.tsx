import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { ResultPanel } from '$/components/evaluations/ResultPanel'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import {
  Commit,
  EvaluationMetric,
  EvaluationResultsV2Search,
  EvaluationResultV2,
  EvaluationType,
} from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { useRef } from 'react'
import { EvaluationBatchIndicator } from './EvaluationBatchIndicator'
import { EvaluationResultsTableBody } from './EvaluationResultsTableBody'

export function EvaluationResultsTable<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  results,
  selectedResult,
  setSelectedResult,
  commits,
  search,
  isLoading,
}: {
  results: EvaluationResultV2<T, M>[]
  selectedResult?: EvaluationResultV2<T, M>
  setSelectedResult: (result?: EvaluationResultV2<T, M>) => void
  commits: Record<number, Commit>
  search: EvaluationResultsV2Search
  setSearch: (search: EvaluationResultsV2Search) => void
  isLoading: boolean
}) {
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const tabelRef = useRef<HTMLTableElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const selectableState = useSelectableRows({
    rowIds: results.filter((r) => !r.error).map((r) => r.uuid),
  })

  return (
    <div className='flex flex-col gap-4 flex-grow min-h-0'>
      <EvaluationBatchIndicator />
      <div
        className={cn('gap-x-4 grid pb-6', {
          'grid-cols-1': !selectedResult,
          'grid-cols-2 xl:grid-cols-[2fr_1fr]': selectedResult,
        })}
      >
        {results.length > 0 ? (
          <div className='flex flex-col gap-4'>
            <EvaluationResultsTableBody
              ref={tabelRef}
              results={results}
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
              commits={commits}
              selectableState={selectableState}
              search={search}
              isLoading={isLoading}
            />
          </div>
        ) : (
          <TableBlankSlate description='There are no results that match the selected filters. Change the filters to see more results.' />
        )}
        {selectedResult && (
          <div ref={panelRef}>
            <ResultPanel
              evaluation={evaluation}
              result={selectedResult}
              commit={commits[selectedResult.commitId]!}
              panelRef={panelRef}
              tableRef={tabelRef}
            />
          </div>
        )}
      </div>
    </div>
  )
}
