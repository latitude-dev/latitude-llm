'use client'

import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { DocumentTraces } from './DocumentTraces'
import { Span } from '@latitude-data/constants'
import { useTraceSpanSelection } from './TraceSpanSelectionContext'
import { ResizableLayout } from './ResizableLayout'
import { TraceInfo } from './TraceInfo'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import useDocumentTracesAggregations from '$/stores/documentTracesAggregations'
import useDocumentTracesDailyCount from '$/stores/documentTracesDailyCount'
import { TracesOverTime } from './TracesOverTime'
import { AggregationPanels } from './AggregationPanels'
import { SpanFilters } from './Filters'
import { SpansFilters } from '$/lib/schemas/filters'
import { useState } from 'react'

export function DocumentTracesPage({
  initialSpans,
  initialSpanFilterOptions,
}: {
  initialSpans: Span[]
  initialSpanFilterOptions: SpansFilters
}) {
  const { selection } = useTraceSpanSelection()
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

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-4 min-w-0'>
      <TableWithHeader
        title='Traces'
        actions={
          <>
            <SpanFilters
              filterOptions={spanFilterOptions}
              onFiltersChanged={setSpanFilterOptions}
            />
          </>
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
              <ResizableLayout
                showRightPane={!!selection.traceId && !!selection.spanId}
                leftPane={<DocumentTraces initialSpans={initialSpans} />}
                rightPane={
                  selection.traceId && selection.spanId && <TraceInfo />
                }
              />
            </div>
          )
        }
      />
    </div>
  )
}
