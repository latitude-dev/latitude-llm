import { RefObject, useRef } from 'react'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { StickyOffset, useStickyNested } from '$/hooks/useStickyNested'
import { DetailsPanel } from '$/components/DetailsPannel'
import { SerializedIssue } from '$/stores/issues'
import { TracesList } from './TracesList'
import { IssueDetails } from './IssueDetails'
import { IssueItemActions } from '../IssueItemActions'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export function IssuesDetailPanel({
  stickyRef,
  onCloseDetails,
  issue,
  containerRef,
  offset,
}: {
  issue: SerializedIssue
  onCloseDetails: () => void
  stickyRef?: RefObject<HTMLTableElement | null>
  containerRef?: RefObject<HTMLDivElement | null>
  offset: StickyOffset
}) {
  const ref = useRef<HTMLDivElement>(null)

  const scrollableArea = usePanelDomRef({ selfRef: ref.current })
  const beacon = stickyRef?.current
  useStickyNested({
    scrollableArea,
    beacon,
    target: ref.current,
    targetContainer: containerRef?.current,
    offset: offset ?? { top: 0, bottom: 0 },
  })
  return (
    <DetailsPanel bordered ref={ref}>
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
          <IssueItemActions issue={issue} onOptimisticAction={onCloseDetails} />
        </div>
        <div className='flex flex-col gap-y-3 border-b border-dashed border-border pb-6'>
          <Text.H3M>{issue.title}</Text.H3M>
          <Text.H5 color='foregroundMuted'>{issue.description}</Text.H5>
        </div>
      </DetailsPanel.Header>
      <DetailsPanel.Body>
        <div className='flex flex-col gap-y-6'>
          <IssueDetails issue={issue} />
          <TracesList issue={issue} />
        </div>
      </DetailsPanel.Body>
    </DetailsPanel>
  )
}
