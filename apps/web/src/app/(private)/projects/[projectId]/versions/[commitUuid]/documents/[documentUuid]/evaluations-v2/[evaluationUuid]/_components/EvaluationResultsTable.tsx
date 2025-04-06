import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { ResultPanel } from '$/components/evaluations/ResultPanel'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import {
  EvaluationMetric,
  EvaluationResultsV2Search,
  EvaluationResultV2WithDetails,
  EvaluationType,
} from '@latitude-data/core/browser'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { cn } from '@latitude-data/web-ui/utils'
import { useRef } from 'react'
import { EvaluationBatchIndicator } from './EvaluationBatchIndicator'
import { EvaluationResultsTableActions } from './EvaluationResultsTableActions'
import { EvaluationResultsTableBody } from './EvaluationResultsTableBody'

export function EvaluationResultsTable<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  results,
  selectedResult,
  setSelectedResult,
  search,
  refinementEnabled,
  isLoading,
}: {
  results: EvaluationResultV2WithDetails<T, M>[]
  selectedResult?: EvaluationResultV2WithDetails<T, M>
  setSelectedResult: (result?: EvaluationResultV2WithDetails<T, M>) => void
  search: EvaluationResultsV2Search
  setSearch: (search: EvaluationResultsV2Search) => void
  refinementEnabled: boolean
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
              selectableState={selectableState}
              search={search}
              isLoading={isLoading}
            />
            <EvaluationResultsTableActions
              selectableState={selectableState}
              refinementEnabled={refinementEnabled}
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
              commit={selectedResult.commit}
              dataset={selectedResult.dataset}
              evaluatedDatasetRow={selectedResult.evaluatedRow}
              evaluatedProviderLog={selectedResult.evaluatedLog}
              panelRef={panelRef}
              tableRef={tabelRef}
            />
          </div>
        )}
      </div>
    </div>
  )
}
