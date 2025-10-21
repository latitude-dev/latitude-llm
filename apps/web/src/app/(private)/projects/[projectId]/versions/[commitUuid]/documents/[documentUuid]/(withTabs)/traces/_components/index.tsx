'use client'

import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { SelectedSpansProvider } from './SelectedSpansContext'
import { DocumentTraces } from './DocumentTraces'
import { Span } from '@latitude-data/constants'
import {
  SelectedTraceIdProvider,
  useSelectedTraceId,
} from './SelectedTraceIdContext'
import { ResizableLayout } from './ResizableLayout'
import { TraceInfo } from './TraceInfo'

export function DocumentTracesPage({ spans: serverSpans }: { spans: Span[] }) {
  return (
    <SelectedSpansProvider>
      <SelectedTraceIdProvider>
        <DocumenTracesPageContent spans={serverSpans} />
      </SelectedTraceIdProvider>
    </SelectedSpansProvider>
  )
}

function DocumenTracesPageContent({ spans: serverSpans }: { spans: Span[] }) {
  const { selectedTraceId } = useSelectedTraceId()
  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Traces'
        table={
          serverSpans.length === 0 ? (
            <TableBlankSlate description='No traces found for this prompt.' />
          ) : (
            <ResizableLayout
              showRightPane={!!selectedTraceId}
              leftPane={<DocumentTraces spans={serverSpans} />}
              rightPane={selectedTraceId && <TraceInfo />}
            />
          )
        }
      />
    </div>
  )
}
