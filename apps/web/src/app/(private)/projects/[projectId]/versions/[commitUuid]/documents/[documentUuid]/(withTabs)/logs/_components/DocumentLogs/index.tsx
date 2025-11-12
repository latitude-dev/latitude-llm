import { getRunErrorFromErrorable } from '$/app/(private)/_lib/getRunErrorFromErrorable'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { OnSelectedSpanFn } from '$/components/tracing/traces/Timeline'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import useDocumentLogsDailyCount from '$/stores/documentLogsDailyCount'
import useProviderLogs from '$/stores/providerLogs'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'
import {
  DocumentLogFilterOptions,
  DocumentLogWithMetadataAndError,
} from '@latitude-data/core/constants'
import {
  DocumentLogsLimitedView,
  DocumentLogsAggregations,
} from '@latitude-data/core/schema/models/types/DocumentLog'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FloatingPanel } from '@latitude-data/web-ui/atoms/FloatingPanel'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useSearchParams } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { LogsOverTime } from '../../../../../../overview/_components/Overview/LogsOverTime'
import { AggregationPanels } from './AggregationPanels'
import { DocumentLogInfo } from './DocumentLogInfo'
import { DocumentLogsTable } from './DocumentLogsTable'
import { DownloadLogsButton } from './DownloadLogsButton'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { SaveLogsAsDatasetModal } from './SaveLogsAsDatasetModal'
import { useSelectedLogs } from './SaveLogsAsDatasetModal/useSelectedLogs'
import { findSpanById } from '@latitude-data/core/services/tracing/spans/findSpanById'
import { useTrace } from '$/stores/traces'
import { useSelectedFromUrl } from '$/hooks/useSelectedFromUrl'

export function DocumentLogs({
  documentLogFilterOptions,
  documentLogs,
  selectedLog: serverSelectedLog,
  aggregations,
  isAggregationsLoading,
  limitedView,
  limitedCursor,
  setLimitedCursor,
}: {
  documentLogFilterOptions: DocumentLogFilterOptions
  documentLogs: DocumentLogWithMetadataAndError[]
  selectedLog?: DocumentLogWithMetadataAndError
  aggregations?: DocumentLogsAggregations
  isAggregationsLoading: boolean
  limitedView?: DocumentLogsLimitedView
  limitedCursor?: string | null
  setLimitedCursor?: (cursor: string | null) => void
}) {
  const stickyRef = useRef<HTMLTableElement>(null)
  const sidebarWrapperRef = useRef<HTMLDivElement>(null)
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const searchParams = useSearchParams()
  const { selectedElement: selectedLog, onSelectChange } = useSelectedFromUrl({
    serverSelected: serverSelectedLog,
    keyField: 'uuid',
    paramsUrlName: 'logUuid',
  })

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

  const selectableLogIds = useMemo(
    () =>
      documentLogs
        .filter((l) => !getRunErrorFromErrorable(l.error))
        .map((l) => l.id),
    [documentLogs],
  )
  const selectableState = useSelectableRows({
    rowIds: selectableLogIds,
    totalRowCount: limitedView
      ? limitedView.totalCount
      : (pagination?.count ?? 0),
  })
  const previewLogsState = useSelectedLogs({
    selectableState,
    filterOptions: documentLogFilterOptions,
  })

  const [selectedSpan, setSelectedSpan] =
    useState<Parameters<OnSelectedSpanFn>[0]>()
  const { data: trace, isLoading: isTraceLoading } = useTrace({
    traceId: selectedSpan?.traceId,
  })
  const span = findSpanById(trace?.children ?? [], selectedSpan?.spanId ?? '')

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

      <div className='flex flex-col flex-grow min-h-0 relative'>
        <TableResizableLayout
          rightPaneRef={sidebarWrapperRef}
          showRightPane={!!selectedLog}
          leftPane={
            <DocumentLogsTable
              ref={stickyRef}
              documentLogs={documentLogs}
              pagination={pagination}
              selectedLog={selectedLog}
              setSelectedLog={onSelectChange}
              selectableState={selectableState}
              limitedView={limitedView}
              limitedCursor={limitedCursor}
              setLimitedCursor={setLimitedCursor}
              onSelectedSpan={setSelectedSpan}
            />
          }
          floatingPanel={
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
          }
          rightPane={
            selectedLog && (
              <DocumentLogInfo
                documentLog={selectedLog}
                providerLogs={providerLogs}
                isLoading={isProviderLogsLoading}
                stickyRef={stickyRef}
                sidebarWrapperRef={sidebarWrapperRef}
                offset={{ top: 12, bottom: 12 }}
                span={span}
                isSpanLoading={isTraceLoading}
              />
            )
          }
        />
        <SaveLogsAsDatasetModal {...previewLogsState} />
      </div>
    </div>
  )
}
