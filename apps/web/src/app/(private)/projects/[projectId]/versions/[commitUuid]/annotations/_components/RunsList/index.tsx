import { SimpleKeysetTablePaginationFooter } from '$/components/TablePaginationFooter/SimpleKeysetTablePaginationFooter'
import {
  EvaluationResultV2,
  RunSourceGroup,
  Span,
} from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { AnnotationProgressPanel } from '$/components/AnnotationProgressPanel'
import { RunsListItem } from './Item'
import { RunSourceSelector } from './SourceSelector'
import { RealtimeToggle } from '$/components/RealtimeToggle'
import InfiniteScroll from 'react-infinite-scroll-component'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'

export function RunsList({
  annotations,
  issuesEnabled,
  spans,
  goToNextPage,
  goToPrevPage,
  hasNext,
  hasPrev,
  totalCount,
  isLoading = false,
  selectedSpanId,
  setSelectedSpanId,
  sourceGroup,
  setSourceGroup,
  toggleRealtime,
  realtimeIsEnabled = false,
}: {
  annotations: EvaluationResultV2[]
  issuesEnabled: boolean
  spans: Span[]
  goToNextPage: () => void
  goToPrevPage: () => void
  hasNext: boolean
  hasPrev: boolean
  totalCount?: number | null
  isLoading?: boolean
  selectedSpanId?: string
  setSelectedSpanId: (id?: string) => void
  sourceGroup: RunSourceGroup
  setSourceGroup: (sourceGroup: RunSourceGroup) => void
  toggleRealtime: (enabled: boolean) => void
  realtimeIsEnabled?: boolean
}) {
  return (
    <div className='w-full h-full flex flex-col gap-6 p-6 relative'>
      <div className='w-full min-h-0 flex flex-col justify-start items-start gap-4 overflow-hidden'>
        <div className='w-full flex justify-between items-center gap-2'>
          <div className='flex flex-col gap-1'>
            <Text.H3>Annotations</Text.H3>
            <Text.H6 color='foregroundMuted'>
              Annotate the traces that <strong>your AI generated</strong>. It
              will help Latitude improve the evaluation quality.
            </Text.H6>
          </div>
        </div>
        {issuesEnabled ? (
          <div className='w-full flex-shrink-0'>
            <AnnotationProgressPanel />
          </div>
        ) : null}
      </div>
      <div className='w-full min-h-0 flex flex-1 flex-col justify-start items-start gap-4'>
        <div className='w-full flex justify-between items-center gap-1'>
          <div className='flex flex-col gap-1'>
            <Text.H4M>Traces</Text.H4M>
            <Text.H6 color='foregroundMuted'>
              This is the results of your AI runs. Select a trace to start
            </Text.H6>
          </div>
          <div className='flex flex-row gap-4'>
            <RealtimeToggle
              enabled={realtimeIsEnabled}
              setEnabled={toggleRealtime}
            />
            <RunSourceSelector value={sourceGroup} setValue={setSourceGroup} />
          </div>
        </div>
        {spans.length > 0 ? (
          <div className='w-full min-h-0 flex flex-1 flex-col border border-border rounded-xl overflow-hidden'>
            {realtimeIsEnabled ? (
              <div
                id='scrollableDiv'
                className='w-full flex-1 flex flex-col rounded-xl overflow-hidden overflow-y-auto custom-scrollbar relative'
              >
                <InfiniteScroll
                  dataLength={spans.length}
                  next={goToNextPage}
                  hasMore={hasNext}
                  loader={
                    <div className='w-full flex items-center justify-center py-4'>
                      <LoadingText />
                    </div>
                  }
                  scrollableTarget='scrollableDiv'
                  scrollThreshold={0.8}
                  className='w-full flex flex-col divide-border divide-y'
                  style={{ margin: 0, padding: 0, width: '100%' }}
                >
                  {spans.map((span) => (
                    <RunsListItem
                      key={span.id}
                      span={span}
                      isSelected={selectedSpanId === span.id}
                      setSelectedSpanId={setSelectedSpanId}
                      annotation={annotations.find(
                        (a) =>
                          a.evaluatedSpanId === span.id &&
                          a.evaluatedTraceId === span.traceId,
                      )}
                    />
                  ))}
                </InfiniteScroll>
              </div>
            ) : (
              <>
                <div className='w-full flex-1 flex flex-col divide-border divide-y rounded-t-xl overflow-hidden overflow-y-auto custom-scrollbar relative'>
                  {spans.map((span) => (
                    <RunsListItem
                      key={span.id}
                      span={span}
                      isSelected={selectedSpanId === span.id}
                      setSelectedSpanId={setSelectedSpanId}
                      annotation={annotations.find(
                        (a) =>
                          a.evaluatedSpanId === span.id &&
                          a.evaluatedTraceId === span.traceId,
                      )}
                    />
                  ))}
                </div>
                <div className='w-full h-12 flex flex-shrink-0 justify-end items-center bg-secondary border-t border-border rounded-b-xl pl-4 pr-1 py-1'>
                  <SimpleKeysetTablePaginationFooter
                    setNext={goToNextPage}
                    setPrev={goToPrevPage}
                    hasNext={hasNext}
                    hasPrev={hasPrev}
                    count={totalCount}
                    countLabel={(count) => `${count} runs`}
                    isLoading={isLoading}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className='w-full h-full flex items-center justify-center gap-2 py-9 px-4 border border-border border-dashed rounded-xl'>
            <Text.H5 color='foregroundMuted'>No traces found</Text.H5>
          </div>
        )}
      </div>
    </div>
  )
}
