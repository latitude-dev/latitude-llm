import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentEvaluationV2 } from '$/app/providers/EvaluationV2Provider'
import { ResultPanel } from '$/components/evaluations/ResultPanel'
import { DevModeProvider } from '$/hooks/useDevMode'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { useEvaluationResultsV2Count } from '$/stores/evaluationResultsV2'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { cn } from '@latitude-data/web-ui/utils'
import { useMemo, useRef } from 'react'
import { EvaluationResultsTableActions } from './TableActions'
import { EvaluationResultsTableBody } from './TableBody'
import { EvaluationMetric, EvaluationType } from '@latitude-data/core/constants'
import { EvaluationResultsV2Search } from '@latitude-data/core/helpers'
import { EvaluationResultV2WithDetails } from '@latitude-data/core/schema/types'

export function EvaluationResultsTable<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>({
  results,
  selectedResult,
  setSelectedResult,
  search,
  setSearch,
  refinementEnabled,
  isLoading: areResultsLoading,
}: {
  results: EvaluationResultV2WithDetails<T, M>[]
  selectedResult?: EvaluationResultV2WithDetails<T, M>
  setSelectedResult: (result?: EvaluationResultV2WithDetails<T, M>) => void
  search: EvaluationResultsV2Search
  setSearch: (search: EvaluationResultsV2Search) => void
  refinementEnabled: boolean
  isLoading?: boolean
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { evaluation } = useCurrentEvaluationV2<T, M>()

  const tabelRef = useRef<HTMLTableElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const { data: count, isLoading: isCountLoading } =
    useEvaluationResultsV2Count({
      project: project,
      commit: commit,
      document: document,
      evaluation: evaluation,
      search: search,
    })

  const selectableResultIds = useMemo(
    () => results.filter((r) => !r.error).map((r) => r.uuid),
    [results],
  )
  const selectableState = useSelectableRows({
    rowIds: selectableResultIds,
    totalRowCount: count,
  })

  const isLoading = areResultsLoading || isCountLoading

  return (
    <div className='flex flex-col gap-4 flex-grow min-h-0'>
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
              totalResults={count}
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
              selectableState={selectableState}
              search={search}
              setSearch={setSearch}
              isLoading={isLoading}
            />
            <DevModeProvider>
              <EvaluationResultsTableActions
                selectableState={selectableState}
                refinementEnabled={refinementEnabled}
                isLoading={isLoading}
              />
            </DevModeProvider>
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
              evaluatedProviderLog={selectedResult.evaluatedLog!}
              panelRef={panelRef}
              tableRef={tabelRef}
            />
          </div>
        )}
      </div>
    </div>
  )
}
