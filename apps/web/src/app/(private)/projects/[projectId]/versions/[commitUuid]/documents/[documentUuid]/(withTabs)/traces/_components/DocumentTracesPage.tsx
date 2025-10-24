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
  } = useSpansKeysetPaginationStore({
    projectId,
    commitUuid,
    documentUuid,
  })

  // Use initial spans for the first render, then switch to loaded data
  const displaySpans = spans.length > 0 ? spans : initialSpans

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
                  {(hasNext || hasPrev) && (
                    <div className='flex justify-between items-center p-4 border-t gap-4'>
                      <Button
                        onClick={goToPrevPage}
                        disabled={isLoading || !hasPrev}
                        variant='outline'
                        size='small'
                      >
                        Previous
                      </Button>
                      <Button
                        onClick={goToNextPage}
                        disabled={isLoading || !hasNext}
                        variant='outline'
                        size='small'
                      >
                        Next
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
