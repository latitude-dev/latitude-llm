'use client'

import { use, useRef, useState } from 'react'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { Span } from '@latitude-data/constants'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentTracesAggregations from '$/stores/documentTracesAggregations'
import useDocumentTracesDailyCount from '$/stores/documentTracesDailyCount'
import { SpansFilters } from '$/lib/schemas/filters'
import { TraceInfoPanel } from '$/components/TracesPanel'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { DocumentTraces } from './DocumentTraces'
import { TracesOverTime } from './TracesOverTime'
import { AggregationPanels } from './AggregationPanels'
import { SpanFilters } from './Filters'
import { SelectionTracesBanner } from './SelectionTracesBanner'
import { ActiveRunPanel } from './ActiveRuns/ActiveRunPanel'
import { TracePanel } from './TracePanel'
import { useTraceSelection } from './useTraceSelection'
import { useActiveRunsByDocument } from '$/stores/runs/activeRunsByDocument'
import { TraceSpanSelectionContext } from './TraceSpanSelectionContext'

export function DocumentTracesPage({
  initialSpans,
  initialSpanFilterOptions,
}: {
  initialSpans: Span[]
  initialSpanFilterOptions: SpansFilters
}) {
  const { clearSelection } = use(TraceSpanSelectionContext)
  const panelContainerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLTableElement>(null)
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const [spanFilterOptions, setSpanFilterOptions] = useState(
    initialSpanFilterOptions,
  )
  const { data: aggregations, isLoading: isAggregationsLoading } =
    useDocumentTracesAggregations({
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: project.id,
    })

  const {
    data: dailyCount,
    isLoading: isDailyCountLoading,
    error: dailyCountError,
  } = useDocumentTracesDailyCount({
    documentUuid: document.documentUuid,
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const spans = useSpansKeysetPaginationStore({
    projectId: String(project.id),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    initialItems: initialSpans,
  })
  const selectableState = useSelectableRows({
    rowIds: spans.items.map((span) => span.id),
    totalRowCount: spans.count ?? spans.items.length,
  })
  const {
    data: activeRuns,
    attachRun,
    stopRun,
    isAttachingRun,
    isStoppingRun,
  } = useActiveRunsByDocument({
    project,
    commit,
    document,
    realtime: true,
    onRunEnded: clearSelection,
  })
  const selection = useTraceSelection(activeRuns)

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-4 min-w-0'>
      <TableWithHeader
        title='Traces'
        actions={
          <SpanFilters
            filterOptions={spanFilterOptions}
            onFiltersChanged={setSpanFilterOptions}
          />
        }
        table={
          initialSpans.length === 0 ? (
            <TableBlankSlate description='No traces found for this prompt.' />
          ) : (
            <div className='flex flex-col gap-4 w-full'>
              <div className='grid xl:grid-cols-2 gap-4'>
                <TracesOverTime
                  data={dailyCount}
                  isLoading={isDailyCountLoading}
                  error={dailyCountError}
                />
                <AggregationPanels
                  aggregations={aggregations}
                  isLoading={isAggregationsLoading}
                />
              </div>
              <TableResizableLayout
                showRightPane={selection.any}
                rightPaneRef={panelContainerRef}
                leftPane={
                  <DocumentTraces
                    ref={panelRef}
                    spans={spans}
                    activeRuns={activeRuns}
                    selectableState={selectableState}
                  />
                }
                floatingPanel={
                  <SelectionTracesBanner
                    spans={spans.items}
                    selectableState={selectableState}
                  />
                }
                rightPane={
                  selection.any ? (
                    <TracePanel
                      panelContainerRef={panelContainerRef}
                      panelRef={panelRef}
                    >
                      {({ ref }) =>
                        selection.active ? (
                          <ActiveRunPanel
                            ref={ref}
                            run={selection.active.run}
                            attachRun={attachRun}
                            stopRun={stopRun}
                            isAttachingRun={isAttachingRun}
                            isStoppingRun={isStoppingRun}
                          />
                        ) : selection.trace ? (
                          <TraceInfoPanel
                            ref={ref}
                            traceId={selection.trace.traceId}
                            spanId={selection.trace.spanId}
                            documentUuid={document.documentUuid}
                          />
                        ) : null
                      }
                    </TracePanel>
                  ) : null
                }
              />
            </div>
          )
        }
      />
    </div>
  )
}
