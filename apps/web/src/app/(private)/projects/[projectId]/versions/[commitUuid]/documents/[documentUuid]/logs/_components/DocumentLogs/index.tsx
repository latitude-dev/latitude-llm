'use client'

import { useMemo, useRef, useState } from 'react'

import {
  DocumentLogWithMetadataAndError,
  ResultWithEvaluation,
} from '@latitude-data/core/repositories'
import { DocumentLogsAggregations } from '@latitude-data/core/services/documentLogs/computeDocumentLogsAggregations'
import {
  Button,
  cn,
  FloatingPanel,
  TableBlankSlate,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import useProviderLogs from '$/stores/providerLogs'

import { AggregationPanels } from './AggregationPanels'
import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'
import { ExportLogsModal } from './ExportLogsModal'
import { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { LogsOverTime } from '../../../../../overview/_components/Overview/LogsOverTime'
import useDocumentLogsDailyCount from '$/stores/documentLogsDailyCount'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'
import { useSelectedLogs } from './SaveLogsAsDatasetModal/useSelectedLogs'
import { SaveLogsAsDatasetModal } from './SaveLogsAsDatasetModal'
import { DownloadLogsButton } from './DownloadLogsButton'

export function DocumentLogs({
  documentLogFilterOptions,
  documentLogs,
  selectedLog: serverSelectedLog,
  aggregations,
  isAggregationsLoading,
  evaluationResults,
  isEvaluationResultsLoading,
}: {
  documentLogFilterOptions: DocumentLogFilterOptions
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog?: DocumentLogWithMetadataAndError
  aggregations?: DocumentLogsAggregations
  isAggregationsLoading: boolean
  evaluationResults: Record<number, ResultWithEvaluation[]>
  isEvaluationResultsLoading: boolean
}) {
  const { data: featureFlag } = useFeatureFlag()
  const hasNewDatasets = featureFlag === true
  const stickyRef = useRef<HTMLTableElement>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement>(null)
  const { document } = useCurrentDocument()
  const { project } = useCurrentProject()
  const [selectedLog, setSelectedLog] = useState<
    DocumentLogWithMetadataAndError | undefined
  >(serverSelectedLog)

  const { data: providerLogs, isLoading: isProviderLogsLoading } =
    useProviderLogs({
      documentLogUuid: selectedLog?.uuid,
    })

  const {
    data: dailyCount,
    isLoading: isDailyCountLoading,
    error: dailyCountError,
  } = useDocumentLogsDailyCount({
    documentUuid: document.documentUuid,
    filterOptions: documentLogFilterOptions,
    projectId: project.id,
  })

  const documentLogIds = useMemo(
    () => documentLogs.map((r) => r.id),
    [documentLogs],
  )
  const [selectedLogsIds, setSelectedLogsIds] = useState<number[]>([])
  const selectableState = useSelectableRows({
    rowIds: documentLogIds,
  })
  const previewLogsState = useSelectedLogs({ selectableState })

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
          documentLogFilterOptions={documentLogFilterOptions}
          evaluationResults={evaluationResults}
          selectedLog={selectedLog}
          setSelectedLog={setSelectedLog}
          isLoading={isEvaluationResultsLoading}
          selectableState={selectableState}
        />
        {selectedLog && (
          <div ref={sidebarWrapperRef}>
            <DocumentLogInfo
              documentLog={selectedLog}
              providerLogs={providerLogs}
              evaluationResults={evaluationResults[selectedLog.id]}
              isLoading={isProviderLogsLoading || isEvaluationResultsLoading}
              stickyRef={stickyRef}
              sidebarWrapperRef={sidebarWrapperRef}
              offset={{ top: 12, bottom: 12 }}
            />
          </div>
        )}
        <div className='flex justify-center sticky bottom-4 pointer-events-none'>
          <FloatingPanel visible={selectableState.selectedCount > 0}>
            <div className='flex flex-row justify-between gap-x-4'>
              <Button
                disabled={selectableState.selectedCount === 0}
                fancy
                onClick={() =>
                  setSelectedLogsIds(selectableState.getSelectedRowIds())
                }
              >
                Export selected logs
              </Button>
              <>
                {hasNewDatasets ? (
                  <>
                    <Button
                      fancy
                      variant='shiny'
                      disabled={selectableState.selectedCount === 0}
                      onClick={previewLogsState.onClickShowPreview}
                    >
                      Save logs to dataset
                    </Button>
                    <DownloadLogsButton selectableState={selectableState} />
                  </>
                ) : null}
              </>
              <Button
                fancy
                variant='outline'
                onClick={selectableState.clearSelections}
              >
                Clear selection
              </Button>
            </div>
          </FloatingPanel>
        </div>
        {/* DEPRECATED: This is for old datasets */}
        <ExportLogsModal
          selectedLogsIds={selectedLogsIds}
          close={() => setSelectedLogsIds([])}
        />
        <SaveLogsAsDatasetModal {...previewLogsState} />
      </div>
    </div>
  )
}
