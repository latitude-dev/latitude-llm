'use client'
import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { SelectedSpansProvider } from './SelectedSpansContext'
import { DocumentTraces } from './DocumentTraces'
import { Span, SpanType } from '@latitude-data/constants'
import {
  SelectedTraceIdProvider,
  useSelectedTraceId,
} from './SelectedTraceIdContext'
import { ResizableLayout } from './ResizableLayout'
import { TraceInfo } from './TraceInfo'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useSpansPaginationStore } from '$/stores/spansPagination'

export function DocumentTracesPage({
  initialSpans,
  hasMore: initialHasMore,
  projectId,
  commitUuid,
  documentUuid,
}: {
  initialSpans: Span[]
  hasMore: boolean
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  return (
    <SelectedSpansProvider>
      <SelectedTraceIdProvider>
        <DocumenTracesPageContent
          initialSpans={initialSpans}
          hasMore={initialHasMore}
          projectId={projectId}
          commitUuid={commitUuid}
          documentUuid={documentUuid}
        />
      </SelectedTraceIdProvider>
    </SelectedSpansProvider>
  )
}

function DocumenTracesPageContent({
  initialSpans,
  hasMore: initialHasMore,
  projectId,
  commitUuid,
  documentUuid,
}: {
  initialSpans: Span[]
  hasMore: boolean
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  const { selectedTraceId } = useSelectedTraceId()
  const { spans, hasMore, isLoading, loadMore } = useSpansPaginationStore({
    projectId,
    commitUuid,
    documentUuid,
    initialSpans,
    initialHasMore,
  })

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Traces'
        table={
          spans.length === 0 ? (
            <TableBlankSlate description='No traces found for this prompt.' />
          ) : (
            <ResizableLayout
              showRightPane={!!selectedTraceId}
              leftPane={
                <div className='flex flex-col h-full'>
                  <DocumentTraces spans={spans as Span<SpanType.Prompt>[]} />
                  {hasMore && (
                    <div className='flex justify-center p-4 border-t'>
                      <Button
                        onClick={loadMore}
                        disabled={isLoading}
                        variant='outline'
                        size='small'
                      >
                        {isLoading ? 'Loading...' : 'Load more'}
                      </Button>
                    </div>
                  )}
                </div>
              }
              rightPane={selectedTraceId && <TraceInfo />}
            />
          )
        }
      />
    </div>
  )
}
