import { RefObject, useCallback, useMemo, useRef } from 'react'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import { DetailsPanel } from '$/components/DetailsPannel'
import { SerializedIssue } from '$/stores/issues'
import { TracesList } from './TracesList'
import { cn } from '@latitude-data/web-ui/utils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import useFeature from '$/stores/useFeature'
import { IssueEvaluation } from './Evaluation'
import { Separator } from '@latitude-data/web-ui/atoms/Separator'
import { Span } from '@latitude-data/constants'
import { TraceInfoPanel } from '$/components/TracesPanel'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { IssueItemActions } from '../IssueItemActions'
import { IssueDetails } from './IssueDetails'

export function IssuesDetailPanel({
  stickyRef,
  onCloseDetails,
  issue,
  selectedSpan,
  setSelectedSpan,
  containerRef,
  offset,
}: {
  issue: SerializedIssue
  selectedSpan: Span | null
  setSelectedSpan: ReactStateDispatch<Span | null>
  onCloseDetails: () => void
  stickyRef?: RefObject<HTMLTableElement | null>
  containerRef?: RefObject<HTMLDivElement | null>
  offset: StickyOffset
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { isEnabled: itIs, isLoading: isLoadingEvaluationGeneratorEnabled } =
    useFeature('evaluationGenerator')
  const isEvaluationGeneratorEnabled = useMemo(
    () => itIs && !isLoadingEvaluationGeneratorEnabled,
    [itIs, isLoadingEvaluationGeneratorEnabled],
  )
  const scrollableArea = usePanelDomRef({ selfRef: ref.current })
  const beacon = stickyRef?.current
  const showDetails = selectedSpan !== null
  const onSelectSpan = useCallback(
    (span: Span) => () => {
      setSelectedSpan(span)
    },
    [setSelectedSpan],
  )
  useStickyNested({
    scrollableArea,
    beacon,
    target: ref.current,
    targetContainer: containerRef?.current,
    offset: offset ?? { top: 0, bottom: 0 },
  })

  return (
    <DetailsPanel bordered ref={ref}>
      <div className='relative w-full overflow-hidden custom-scrollbar'>
        {/* === SLIDING PANEL WRAPPER === */}
        <div
          className={cn(
            'grid grid-cols-2 w-[200%]',
            'transition-transform duration-300',
            {
              '-translate-x-1/2': showDetails,
            },
          )}
        >
          {/* === LIST OF SPANS === */}
          <div
            className={cn(
              'relative w-full transition-opacity duration-300',
              'flex flex-col gap-y-4',
              {
                'opacity-0': showDetails,
                'opacity-100': !showDetails,
              },
            )}
          >
            <DetailsPanel.Header>
              <div className='flex justify-between items-center mb-8'>
                <Tooltip
                  asChild
                  trigger={
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={onCloseDetails}
                      iconProps={{ name: 'chevronsRight' }}
                    />
                  }
                >
                  Close details
                </Tooltip>
                <IssueItemActions
                  placement='details'
                  issue={issue}
                  onOptimisticAction={onCloseDetails}
                />
              </div>
              <div className='flex flex-col gap-y-3 border-b border-dashed border-border pb-6'>
                <Text.H3M>{issue.title}</Text.H3M>
                <Text.H5 color='foregroundMuted'>{issue.description}</Text.H5>
              </div>
            </DetailsPanel.Header>
            <DetailsPanel.Body>
              <div className='flex flex-col gap-y-6'>
                {isEvaluationGeneratorEnabled ? (
                  <div className='flex flex-col pt-1 gap-y-6'>
                    <IssueEvaluation issue={issue} />
                    <Separator variant='dashed' />
                  </div>
                ) : null}
                <IssueDetails issue={issue} />
                <TracesList issue={issue} onView={onSelectSpan} />
              </div>
            </DetailsPanel.Body>
          </div>

          {/* === DETAILS SCREEN === */}
          <div
            className={cn(
              'relative w-full transition-opacity duration-300',
              'flex flex-col gap-y-4',
              {
                'opacity-0': !showDetails,
                'opacity-100': showDetails,
              },
            )}
          >
            <DetailsPanel.Header>
              <Button
                variant='ghost'
                size='none'
                iconProps={{ name: 'chevronLeft' }}
                onClick={() => setSelectedSpan(null)}
              >
                Back to list
              </Button>
            </DetailsPanel.Header>
            <DetailsPanel.Body>
              {selectedSpan ? (
                <TraceInfoPanel
                  insideOtherPanel
                  spanId={selectedSpan.id}
                  traceId={selectedSpan.traceId}
                  documentUuid={issue.documentUuid}
                />
              ) : null}
            </DetailsPanel.Body>
          </div>
        </div>
      </div>
    </DetailsPanel>
  )
}
