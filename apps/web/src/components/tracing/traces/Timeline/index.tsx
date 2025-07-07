import { AssembledSpan, AssembledTrace } from '@latitude-data/core/browser'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useEffect, useState } from 'react'
import { TimelineGraph } from './Graph'
import { TimelineTree } from './Tree'

export type OnSelectedSpanFn = (args?: {
  conversationId: string
  traceId: string
  spanId: string
}) => void

export function Timeline({
  trace,
  onSelectedSpan,
}: {
  trace: AssembledTrace
  onSelectedSpan?: OnSelectedSpanFn
}) {
  const [selectedSpan, setSelectedSpan] = useState<AssembledSpan>()
  useEffect(() => {
    if (!selectedSpan) onSelectedSpan?.(undefined)
    else {
      onSelectedSpan?.({
        conversationId: trace.conversationId,
        traceId: trace.id,
        spanId: selectedSpan.id,
      })
    }
  }, [trace, selectedSpan, onSelectedSpan])

  if (trace.children.length < 1) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4'>
        <Text.H5 color='foregroundMuted'>No events found so far</Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full h-full flex items-center justify-center'>
      <SplitPane
        direction='horizontal'
        initialPercentage={25}
        minSize={125}
        firstPane={
          <div className='w-full h-full overflow-hidden'>
            <TimelineTree
              trace={trace}
              selectedSpan={selectedSpan}
              setSelectedSpan={setSelectedSpan}
            />
          </div>
        }
        secondPane={
          <div className='w-full h-full overflow-hidden'>
            <TimelineGraph
              trace={trace}
              selectedSpan={selectedSpan}
              setSelectedSpan={setSelectedSpan}
            />
          </div>
        }
      />
    </div>
  )
}
