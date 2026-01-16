'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { TraceInfoPanel } from '$/components/TracesPanel'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { SpansFilters, parseSpansFilters } from '$/lib/schemas/filters'
import useDocumentTracesAggregations from '$/stores/documentTracesAggregations'
import useDocumentTracesDailyCount from '$/stores/documentTracesDailyCount'
import { useActiveRunsByDocument } from '$/stores/runs/activeRunsByDocument'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { Span } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { useSearchParams } from 'next/navigation'
import { use, useRef, useState } from 'react'
import { ActiveRunPanel } from './ActiveRuns/ActiveRunPanel'
import { AggregationPanels } from './AggregationPanels'
import { DocumentTraces } from './DocumentTraces'
import { SpanFilters } from './Filters'
import { SelectionTracesBanner } from './SelectionTracesBanner'
import { TracePanel } from './TracePanel'
import { TracesOverTime } from './TracesOverTime'
import { TraceSpanSelectionContext } from './TraceSpanSelectionContext'
import { useTraceSelection } from './useTraceSelection'

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
  const searchParams = useSearchParams()
  const filtersParam = searchParams.get('filters')
  const filters = parseSpansFilters(filtersParam, 'DocumentTracesPage') ?? {}
  const spans = useSpansKeysetPaginationStore({
    projectId: String(project.id),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    initialItems: initialSpans,
    filters,
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
        title={
          <Text.H4M noWrap ellipsis>
            Traces
          </Text.H4M>
        }
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
                    filters={filters}
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
                            documentLogUuid={selection.trace.documentLogUuid}
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
