'use client'

import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { AssembledSpan, AssembledTrace } from '@latitude-data/core/constants'
import { useConversation } from '$/stores/conversations'
import { use, useCallback, useMemo, useState } from 'react'
import { TimelineScale } from '$/components/tracing/traces/TimelineScale'
import { useTickMarks } from '$/components/tracing/traces/TimelineScale/useTickMarks'
import {
  TraceSpanSelectionActionsContext,
  TraceSpanSelectionStateContext,
} from './TraceSpanSelectionContext'
import { ConversationTree } from './ConversationTree'
import { ConversationGraph } from './ConversationGraph'

const TREE_MIN_WIDTH = 125
const GRAPH_MIN_WIDTH = 750

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

  return <UnifiedTimeline traces={traces} documentLogUuid={documentLogUuid} />
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

function UnifiedTimeline({
  traces,
  documentLogUuid: _documentLogUuid,
}: {
  traces: AssembledTrace[]
  documentLogUuid: string
}) {
  const { selection } = use(TraceSpanSelectionStateContext)
  const { selectSpan } = use(TraceSpanSelectionActionsContext)

  const isConversationSelected = !selection.spanId && traces.length > 1
  const onSelectConversation = useCallback(() => {
    if (traces.length === 1 && traces[0]?.children[0]) {
      selectSpan(traces[0].children[0])
      return
    }

    selectSpan()
  }, [traces, selectSpan])

  const { selectedSpan, totalSpans, sections, totalDuration } = useMemo(() => {
    const totalSpans = traces.reduce((sum, t) => sum + t.children.length, 0)
    const totalDuration = traces.reduce((sum, t) => sum + t.duration, 0)
    const sections = getTraceSections(traces)
    const found = findSpanByIdInTraces(traces, selection.spanId)
    const selectedSpan = found ?? null
    return { selectedSpan, totalSpans, sections, totalDuration }
  }, [traces, selection.spanId])

  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set())
  const tickMarks = useTickMarks({ duration: totalDuration, width: 0 })
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

  const allSpanIds = useMemo(() => {
    const ids: string[] = []
    const collectIds = (span: AssembledSpan) => {
      if (span.children.length > 0) {
        ids.push(span.id)
        span.children.forEach(collectIds)
      }
    }
    sections.forEach((section) => section.trace.children.forEach(collectIds))
    return ids
  }, [sections])

  const isConversationCollapsed =
    allSpanIds.length > 0 && allSpanIds.every((id) => collapsedSpans.has(id))

  const toggleCollapseAll = useCallback(() => {
    setCollapsedSpans(() => {
      if (isConversationCollapsed) {
        return new Set()
      }
      return new Set(allSpanIds)
    })
  }, [allSpanIds, isConversationCollapsed])

  if (totalSpans < 1) {
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
          <div className='w-full h-full overflow-hidden'>
            <ConversationTree
              sections={sections}
              selectedSpan={selectedSpan ?? undefined}
              minWidth={TREE_MIN_WIDTH}
              selectSpan={selectSpan}
              collapsedSpans={collapsedSpans}
              toggleCollapsed={toggleCollapsed}
              isConversationSelected={isConversationSelected}
              onSelectConversation={onSelectConversation}
              isConversationCollapsed={isConversationCollapsed}
              toggleCollapseAll={toggleCollapseAll}
              setCollapsedSpans={setCollapsedSpans}
            />
          </div>
        }
        secondPane={
          <div className='w-full h-full overflow-x-auto'>
            <div
              className='flex flex-col h-full'
              style={{ minWidth: `${GRAPH_MIN_WIDTH}px` }}
            >
              <div className='flex-1 min-h-0'>
                <ConversationGraph
                  sections={sections}
                  totalDuration={totalDuration}
                  minWidth={GRAPH_MIN_WIDTH}
                  selectedSpan={selectedSpan ?? undefined}
                  selectSpan={selectSpan}
                  collapsedSpans={collapsedSpans}
                  toggleCollapsed={toggleCollapsed}
                  setCollapsedSpans={setCollapsedSpans}
                  showConversationSpacer={sections.length > 1}
                  isConversationCollapsed={isConversationCollapsed}
                  isConversationSelected={isConversationSelected}
                  tickMarks={tickMarks}
                />
              </div>
              <div className='relative h-8 bg-secondary border-t border-border pb-2 flex-shrink-0'>
                <TimelineScale tickMarks={tickMarks} />
              </div>
            </div>
          </div>
        }
      />
    </div>
  )
}
