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
import { useSpansKeysetPaginationStore } from '$/stores/spansKeysetPagination'

export function DocumentTracesPage({
  initialSpans,
  projectId,
  commitUuid,
  documentUuid,
}: {
  initialSpans: Span[]
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  return (
    <SelectedSpansProvider>
      <SelectedTraceIdProvider>
        <DocumenTracesPageContent
          initialSpans={initialSpans}
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
  projectId,
  commitUuid,
  documentUuid,
}: {
  initialSpans: Span[]
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  const { selectedTraceId } = useSelectedTraceId()
  const {
    items: spans,
    hasNext,
    hasPrev,
    isLoading,
    goToNextPage,
    goToPrevPage,
    currentCursor,
    cursorHistoryLength,
  } = useSpansKeysetPaginationStore({
    projectId,
    commitUuid,
    documentUuid,
  })

  // Only use initial spans on the very first load (when no cursor is set)
  // Don't fall back to initial spans when navigating between pages
  const displaySpans =
    currentCursor === null && spans.length === 0 ? initialSpans : spans

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Traces'
        table={
          displaySpans.length === 0 ? (
            <TableBlankSlate description='No traces found for this prompt.' />
          ) : (
            <ResizableLayout
              showRightPane={!!selectedTraceId}
              leftPane={
                <div className='flex flex-col h-full'>
                  <DocumentTraces
                    spans={displaySpans as Span<SpanType.Prompt>[]}
                  />
                  {(hasNext || hasPrev || isLoading) && (
                    <div className='flex justify-between items-center p-4 border-t gap-4'>
                      <Button
                        onClick={goToPrevPage}
                        disabled={isLoading || !hasPrev}
                        variant='outline'
                        size='small'
                      >
                        {isLoading && cursorHistoryLength === 0
                          ? 'Loading...'
                          : 'Previous'}
                      </Button>
                      <div className='text-sm text-muted-foreground'>
                        {isLoading && cursorHistoryLength > 0
                          ? 'Loading page...'
                          : ''}
                      </div>
                      <Button
                        onClick={goToNextPage}
                        disabled={isLoading || !hasNext}
                        variant='outline'
                        size='small'
                      >
                        {isLoading && cursorHistoryLength === 0
                          ? 'Loading...'
                          : 'Next'}
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
