import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TimelineGraph } from './Graph'
import { TimelineScale } from './Scale'
import { TimelineTree } from './Tree'
import { AssembledSpan, AssembledTrace } from '@latitude-data/core/constants'

const TREE_MIN_WIDTH = 125 // 125px
const GRAPH_MIN_WIDTH = 450 // 450px

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
  const treeRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(0)
  const graphRef = useRef<HTMLDivElement>(null)
  const [graphWidth, setGraphWidth] = useState(0)
  const updateWidth = useCallback(() => {
    if (!treeRef.current || !graphRef.current) return
    const treeRect = treeRef.current.getBoundingClientRect()
    const graphRect = graphRef.current.getBoundingClientRect()
    setTreeWidth(Math.max(treeRect.width, TREE_MIN_WIDTH) - 0.5)
    setGraphWidth(Math.max(graphRect.width, GRAPH_MIN_WIDTH) + 0.5)
  }, [setTreeWidth, setGraphWidth])
  useEffect(() => {
    if (!treeRef.current || !graphRef.current) return
    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(treeRef.current)
    resizeObserver.observe(graphRef.current)
    return () => resizeObserver.disconnect()
  }, [updateWidth])

  const [selectedSpan, setSelectedSpan] = useState<AssembledSpan>()
  const selectSpan = useCallback(
    (span?: AssembledSpan) => setSelectedSpan(span),
    [setSelectedSpan],
  )
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

  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set())
  const toggleCollapsed = useCallback(
    (spanId: string) =>
      setCollapsedSpans((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(spanId)) newSet.delete(spanId)
        else newSet.add(spanId)
        return newSet
      }),
    [setCollapsedSpans],
  )

  if (trace.children.length < 1) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4'>
        <Text.H5 color='foregroundMuted'>No events found so far</Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full h-full flex flex-col items-center justify-center relative'>
      <SplitPane
        direction='horizontal'
        initialPercentage={33}
        minSize={TREE_MIN_WIDTH}
        firstPane={
          <div ref={treeRef} className='w-full h-full overflow-hidden'>
            <TimelineTree
              trace={trace}
              width={treeWidth}
              minWidth={TREE_MIN_WIDTH}
              selectedSpan={selectedSpan}
              selectSpan={selectSpan}
              collapsedSpans={collapsedSpans}
              toggleCollapsed={toggleCollapsed}
            />
          </div>
        }
        secondPane={
          <div ref={graphRef} className='w-full h-full overflow-hidden'>
            <TimelineGraph
              trace={trace}
              width={graphWidth}
              minWidth={GRAPH_MIN_WIDTH}
              selectedSpan={selectedSpan}
              selectSpan={selectSpan}
              collapsedSpans={collapsedSpans}
            />
          </div>
        }
      />
      <div className='w-full h-8 flex items-center justify-center sticky bottom-0'>
        <div
          className='w-full h-full bg-transparent'
          style={{ width: treeWidth }}
        >
          {/* Empty space matching the tree pane */}
        </div>
        <div
          className='w-full h-full bg-secondary border-t border-l border-border pb-2'
          style={{ width: graphWidth }}
        >
          <TimelineScale
            duration={trace.duration}
            width={graphWidth}
            minWidth={GRAPH_MIN_WIDTH}
          />
        </div>
      </div>
    </div>
  )
}
