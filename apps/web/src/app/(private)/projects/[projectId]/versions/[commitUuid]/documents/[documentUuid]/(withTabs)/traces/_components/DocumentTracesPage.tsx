'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { TableResizableLayout } from '$/components/TableResizableLayout'
import { TraceInfoPanel } from '$/components/TracesPanel'
import { SpansFilters, parseSpansFilters } from '$/lib/schemas/filters'
import useDocumentTracesAggregations from '$/stores/documentTracesAggregations'
import useDocumentTracesDailyCount from '$/stores/documentTracesDailyCount'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { useSearchParams } from 'next/navigation'
import { use, useRef, useState } from 'react'
import { AggregationPanels } from './AggregationPanels'
import { DocumentTraces } from './DocumentTraces'
import { SpanFilters } from './Filters'
import { TracePanel } from './TracePanel'
import { TracesOverTime } from './TracesOverTime'
import { TraceSpanSelectionStateContext } from './TraceSpanSelectionContext'
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'
import { SpanType } from '@latitude-data/constants'

export function DocumentTracesPage({
  initialSpanFilterOptions,
}: {
  initialSpanFilterOptions: SpansFilters
}) {
  const { selection } = use(TraceSpanSelectionStateContext)
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
  const urlFilters = parseSpansFilters(filtersParam, 'DocumentTracesPage')
  const filters = urlFilters ?? initialSpanFilterOptions

  const traces = useSpansKeysetPaginationStore({
    projectId: String(project.id),
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    types: [SpanType.Prompt, SpanType.External],
    filters,
  })

  const hasSelection = !!selection.documentLogUuid && !!selection.spanId

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
          !traces.items.length && !traces.isLoading ? (
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
                showRightPane={hasSelection}
                rightPaneRef={panelContainerRef}
                leftPane={
                  <DocumentTraces ref={panelRef} traces={traces} />
                }
                rightPane={
                  hasSelection ? (
                    <TracePanel
                      panelContainerRef={panelContainerRef}
                      panelRef={panelRef}
                    >
                      {({ ref }) => (
                        <TraceInfoPanel
                          ref={ref}
                          documentLogUuid={selection.documentLogUuid!}
                          spanId={selection.spanId!}
                          documentUuid={document.documentUuid}
                        />
                      )}
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
