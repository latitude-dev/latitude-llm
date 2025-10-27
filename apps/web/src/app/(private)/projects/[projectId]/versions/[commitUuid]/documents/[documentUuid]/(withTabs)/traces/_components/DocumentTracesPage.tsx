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

export function DocumentTracesPage({ initialSpans }: { initialSpans: Span[] }) {
  return <DocumenTracesPageContent initialSpans={initialSpans} />
}

function DocumenTracesPageContent({ initialSpans }: { initialSpans: Span[] }) {
  const { selection } = useTraceSpanSelection()
  const { document } = useCurrentDocument()
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

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

      <TableWithHeader
        title='Traces'
        table={
          initialSpans.length === 0 ? (
            <TableBlankSlate description='No traces found for this prompt.' />
          ) : (
            <ResizableLayout
              showRightPane={!!selection.traceId}
              leftPane={<DocumentTraces initialSpans={initialSpans} />}
              rightPane={selection.traceId && <TraceInfo />}
            />
          )
        }
      />
    </div>
  )
}
