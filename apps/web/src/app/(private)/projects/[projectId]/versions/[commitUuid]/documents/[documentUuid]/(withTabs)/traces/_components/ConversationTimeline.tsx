'use client'

import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { AssembledSpan, AssembledTrace } from '@latitude-data/core/constants'
import { useConversation } from '$/stores/conversations'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TimelineScale } from '$/components/tracing/traces/Timeline/Scale'
import { TraceSpanSelectionContext } from './TraceSpanSelectionContext'
import { ConversationTree } from './ConversationTree'
import { ConversationGraph } from './ConversationGraph'

const TREE_MIN_WIDTH = 125
const GRAPH_MIN_WIDTH = 450

export function ConversationTimeline({
  documentLogUuid,
}: {
  documentLogUuid: string
}) {
  const { traces, isLoading } = useConversation({
    conversationId: documentLogUuid,
  })

  if (isLoading) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4 bg-secondary'>
        <Icon name='loader' color='foregroundMuted' className='animate-spin' />
        <Text.H5 color='foregroundMuted'>Assembling traces</Text.H5>
      </div>
    )
  }

  if (traces.length === 0) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4 bg-secondary'>
        <Text.H5 color='foregroundMuted'>No traces found</Text.H5>
      </div>
    )
  }

  return <UnifiedTimeline traces={traces} />
}

export type TraceSection = {
  trace: AssembledTrace
  index: number
  cumulativeOffset: number
}

function getTraceSections(traces: AssembledTrace[]): TraceSection[] {
  let cumulativeOffset = 0
  return traces.map((trace, index) => {
    const section = { trace, index, cumulativeOffset }
    cumulativeOffset += trace.duration
    return section
  })
}

function findSpanByIdInTraces(
  traces: AssembledTrace[],
  spanId?: string | null,
): AssembledSpan | null {
  if (!spanId) return null

  for (const trace of traces) {
    const queue: AssembledSpan[] = [...trace.children]
    while (queue.length > 0) {
      const currentSpan = queue.shift()!
      if (currentSpan.id === spanId) {
        return currentSpan
      }
      if (currentSpan.children && currentSpan.children.length > 0) {
        queue.push(...currentSpan.children)
      }
    }
  }

  return null
}

function UnifiedTimeline({ traces }: { traces: AssembledTrace[] }) {
  const { selection, selectSpan } = use(TraceSpanSelectionContext)
  const selectedSpan = findSpanByIdInTraces(traces, selection.spanId)
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

  const sections = useMemo(() => getTraceSections(traces), [traces])
  const totalDuration = useMemo(
    () => traces.reduce((sum, t) => sum + t.duration, 0),
    [traces],
  )

  const totalSpans = traces.reduce((sum, t) => sum + t.children.length, 0)
  if (totalSpans < 1) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4'>
        <Text.H5 color='foregroundMuted'>No events found so far</Text.H5>
      </div>
    )
  }

  if (!selectedSpan) {
    const firstSpan = traces[0]?.children[0]
    if (firstSpan) {
      selectSpan(firstSpan)
    }
    return null
  }

  return (
    <div className='w-full h-full flex flex-col items-center justify-center relative'>
      <SplitPane
        direction='horizontal'
        initialPercentage={33}
        minSize={TREE_MIN_WIDTH}
        firstPane={
          <div ref={treeRef} className='w-full h-full overflow-hidden'>
            <ConversationTree
              sections={sections}
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
            <ConversationGraph
              sections={sections}
              totalDuration={totalDuration}
              width={graphWidth}
              minWidth={GRAPH_MIN_WIDTH}
              selectedSpan={selectedSpan}
              selectSpan={selectSpan}
              collapsedSpans={collapsedSpans}
              toggleCollapsed={toggleCollapsed}
            />
          </div>
        }
      />
      <div className='w-full h-8 flex items-center justify-center sticky bottom-0'>
        <div
          className='w-full h-full bg-transparent'
          style={{ width: treeWidth }}
        />
        <div
          className='w-full h-full bg-secondary border-t border-l border-border pb-2'
          style={{ width: graphWidth }}
        >
          <TimelineScale
            duration={totalDuration}
            width={graphWidth}
            minWidth={GRAPH_MIN_WIDTH}
          />
        </div>
      </div>
    </div>
  )
}
