'use client'

import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { DocumentTraces } from './DocumentTraces'
import { Span } from '@latitude-data/constants'
import { useTraceSpanSelection } from './TraceSpanSelectionContext'
import { ResizableLayout } from './ResizableLayout'
import { TraceInfo } from './TraceInfo'

export function DocumentTracesPage({ initialSpans }: { initialSpans: Span[] }) {
  return <DocumenTracesPageContent initialSpans={initialSpans} />
}

function DocumenTracesPageContent({ initialSpans }: { initialSpans: Span[] }) {
  const { selection } = useTraceSpanSelection()

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
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
