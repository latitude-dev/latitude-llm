import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import useDocumentLogsDailyCount from '$/stores/documentLogsDailyCount'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useProviderLogs from '$/stores/providerLogs'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import {
  DocumentLogFilterOptions,
  DocumentLogsLimitedView,
  DocumentLogsAggregations,
  DocumentLogWithMetadataAndError,
  EvaluationV2,
  ResultWithEvaluationV2,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import { useSearchParams } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { LogsOverTime } from '../../../../../overview/_components/Overview/LogsOverTime'
import { AggregationPanels } from './AggregationPanels'
import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogAnnotation } from './DocumentLogInfo/Annotation'
import { DocumentLogsTable } from './DocumentLogsTable'
import { DownloadLogsButton } from './DownloadLogsButton'
import { SaveLogsAsDatasetModal } from './SaveLogsAsDatasetModal'
import { useSelectedLogs } from './SaveLogsAsDatasetModal/useSelectedLogs'

export function DocumentLogs({
  documentLogFilterOptions,
  documentLogs,
  selectedLog: serverSelectedLog,
  aggregations,
  isAggregationsLoading,
  evaluationResults,
  mutateEvaluationResults,
  isEvaluationsLoading,
  evaluations,
  annotateEvaluation,
  isAnnotatingEvaluation,
  limitedView,
  limitedCursor,
  setLimitedCursor,
}: {
  documentLogFilterOptions: DocumentLogFilterOptions
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog?: DocumentLogWithMetadataAndError
  aggregations?: DocumentLogsAggregations
  isAggregationsLoading: boolean
  evaluationResults: Record<string, ResultWithEvaluationV2[]>
  mutateEvaluationResults: ReturnType<
    typeof useEvaluationResultsV2ByDocumentLogs
  >['mutate']
  isEvaluationsLoading: boolean
  evaluations: EvaluationV2[]
  annotateEvaluation: ReturnType<typeof useEvaluationsV2>['annotateEvaluation']
  isAnnotatingEvaluation: boolean
  limitedView?: DocumentLogsLimitedView
  limitedCursor?: string | null
  setLimitedCursor?: (cursor: string | null) => void
}) {
  const stickyRef = useRef<HTMLTableElement>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement>(null)
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadataAndError | undefined
  >(serverSelectedLog)

  const { data: providerLogs, isLoading: isProviderLogsLoading } =
    useProviderLogs({
      documentLogUuid: selectedLog?.uuid,
    })

  const {
    data: dailyCountNormal,
    isLoading: isDailyCountLoading,
    error: dailyCountError,
  } = useDocumentLogsDailyCount({
    documentUuid: document.documentUuid,
    filterOptions: documentLogFilterOptions,
    projectId: project.id,
    disable: !!limitedView,
  })

  const dailyCount = useMemo(() => {
    if (limitedView) return limitedView.dailyCount
    return dailyCountNormal
  }, [limitedView, dailyCountNormal])

  const searchParams = useSearchParams()
  const page = searchParams.get('page') ?? '1'
  const pageSize = searchParams.get('pageSize') ?? '25'
  const { data: pagination } = useDocumentLogsPagination({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    filterOptions: documentLogFilterOptions,
    page,
    pageSize,
    disable: !!limitedView,
  })

  const documentLogIds = useMemo(
    () => documentLogs.map((r) => r.id),
    [documentLogs],
  )
  const selectableState = useSelectableRows({
    rowIds: documentLogIds,
    totalRowCount: limitedView
      ? limitedView.totalCount
      : (pagination?.count ?? 0),
  })
  const previewLogsState = useSelectedLogs({
    selectableState,
    filterOptions: documentLogFilterOptions,
  })

  const manualEvaluations = useMemo(
    () =>
      evaluations.filter(
        (e) => getEvaluationMetricSpecification(e).supportsManualEvaluation,
      ),
    [evaluations],
  )

  const responseLog = useMemo(() => {
    if (!selectedLog) return undefined
    if (selectedLog.error.code) return undefined

    const lastProviderLog = providerLogs.at(-1)
    if (!lastProviderLog) return undefined
    if (lastProviderLog.documentLogUuid != selectedLog.uuid) return undefined

    return lastProviderLog
  }, [selectedLog, providerLogs])

  if (
    !documentLogFilterOptions.logSources.length &&
    !documentLogFilterOptions.logSources.length
  ) {
    return (
      <TableBlankSlate description='Select one or more log sources and commits to see logs.' />
    )
  }

  if (!documentLogs.length) {
    return (
      <TableBlankSlate description='There are no logs that match the selected filters. Change the filters to see more logs.' />
    )
  }

  return (
    <div className='flex flex-col flex-grow min-h-0 w-full gap-4'>
      <div className='grid xl:grid-cols-2 gap-4 flex-grow'>
        <LogsOverTime
          data={dailyCount}
          isLoading={isDailyCountLoading}
          error={dailyCountError}
        />
        <AggregationPanels
          aggregations={aggregations}
          isLoading={isAggregationsLoading}
        />
      </div>

      <div
        className={cn('gap-x-4 grid pb-6', {
          'grid-cols-1': !selectedLog,
          'grid-cols-2 xl:grid-cols-[2fr_1fr]': selectedLog,
        })}
      >
        <DocumentLogsTable
          ref={stickyRef}
          documentLogs={documentLogs}
          pagination={pagination}
          evaluationResults={evaluationResults}
          evaluations={evaluations}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
          isLoading={isEvaluationsLoading}
          selectableState={selectableState}
          limitedView={limitedView}
          limitedCursor={limitedCursor}
          setLimitedCursor={setLimitedCursor}
        />
        {selectedLog && (
          <div ref={sidebarWrapperRef}>
            <DocumentLogInfo
              documentLog={selectedLog}
              providerLogs={providerLogs}
              evaluationResults={evaluationResults[selectedLog.uuid]}
              isLoading={isProviderLogsLoading || isEvaluationsLoading}
              stickyRef={stickyRef}
              sidebarWrapperRef={sidebarWrapperRef}
              offset={{ top: 12, bottom: 12 }}
            >
              {manualEvaluations.length > 0 && !!responseLog && (
                <div className='w-full border-t flex flex-col gap-y-4 mt-4 pt-4'>
                  {manualEvaluations.map((evaluation) => (
                    <DocumentLogAnnotation
                      key={evaluation.uuid}
                      evaluation={evaluation}
                      result={
                        evaluationResults[selectedLog.uuid]?.find(
                          (r) => r.evaluation.uuid === evaluation.uuid,
                        )?.result
                      }
                      mutateEvaluationResults={mutateEvaluationResults}
                      providerLog={responseLog}
                      documentLog={selectedLog}
                      commit={selectedLog.commit}
                      annotateEvaluation={annotateEvaluation}
                      isAnnotatingEvaluation={isAnnotatingEvaluation}
                    />
                  ))}
                </div>
              )}
            </DocumentLogInfo>
          </div>
        )}
        <div className='flex justify-center sticky bottom-4 pointer-events-none'>
          <FloatingPanel visible={selectableState.selectedCount > 0}>
            <div className='flex flex-row items-center gap-x-4'>
              <div className='flex flex-row gap-x-2'>
                <Button
                  fancy
                  disabled={selectableState.selectedCount === 0}
                  onClick={previewLogsState.onClickShowPreview}
                >
                  Add {selectableState.selectedCount} logs to dataset
                </Button>
                <DownloadLogsButton
                  filterOptions={documentLogFilterOptions}
                  selectableState={selectableState}
                />
              </div>
              <Tooltip
                asChild
                trigger={
                  <Button
                    iconProps={{
                      name: 'close',
                    }}
                    className='p-0'
                    variant='ghost'
                    onClick={selectableState.clearSelections}
                  />
                }
              >
                Clear selection
              </Tooltip>
            </div>
          </FloatingPanel>
        </div>
        <SaveLogsAsDatasetModal {...previewLogsState} />
      </div>
    </div>
  )
}
