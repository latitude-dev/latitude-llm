'use client'

import { useMemo } from 'react'

import { TraceWithSpans } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui'
import { formatDuration } from '$/app/_lib/formatUtils'

type SpanNode = {
  span: TraceWithSpans['spans'][0]
  children: SpanNode[]
  level: number
}

export function SpanTimeline({ trace }: { trace: TraceWithSpans }) {
  const timeRange = useMemo(() => {
    let earliestTime = new Date(trace.startTime).getTime()
    let latestTime = new Date(trace.endTime || trace.startTime).getTime()

    trace.spans.forEach((span) => {
      const startTime = new Date(span.startTime).getTime()
      const endTime = new Date(span.endTime || span.startTime).getTime()

      earliestTime = Math.min(earliestTime, startTime)
      latestTime = Math.max(latestTime, endTime)
    })

    return {
      start: earliestTime,
      end: latestTime,
      duration: latestTime - earliestTime,
    }
  }, [trace])

  const spanHierarchy = useMemo(() => {
    const hierarchyMap = new Map<string, SpanNode>()

    trace.spans.forEach((span) => {
      hierarchyMap.set(span.spanId, {
        span,
        children: [],
        level: 0,
      })
    })

    const rootNodes: SpanNode[] = []
    trace.spans.forEach((span) => {
      const node = hierarchyMap.get(span.spanId)!
      if (span.parentSpanId && hierarchyMap.has(span.parentSpanId)) {
        const parentNode = hierarchyMap.get(span.parentSpanId)!
        parentNode.children.push(node)
        node.level = parentNode.level + 1
      } else {
        rootNodes.push(node)
      }
    })

    const sortNodes = (nodes: SpanNode[]) => {
      nodes.sort(
        (a, b) =>
          new Date(a.span.startTime).getTime() -
          new Date(b.span.startTime).getTime(),
      )
      nodes.forEach((node) => sortNodes(node.children))
    }
    sortNodes(rootNodes)

    const flattenHierarchy = (nodes: SpanNode[]): SpanNode[] => {
      return nodes.reduce((acc, node) => {
        return [...acc, node, ...flattenHierarchy(node.children)]
      }, [] as SpanNode[])
    }

    return flattenHierarchy(rootNodes)
  }, [trace.spans])

  return (
    <div className='flex flex-col gap-2 mt-4 max-w-full'>
      {spanHierarchy.map((node) => {
        const { span } = node
        const spanStart = new Date(span.startTime).getTime()
        const spanEnd = new Date(span.endTime || span.startTime).getTime()
        const spanDuration = spanEnd - spanStart

        const leftPosition =
          ((spanStart - timeRange.start) / timeRange.duration) * 100
        const width = (spanDuration / timeRange.duration) * 100

        return (
          <div key={span.spanId} className='relative w-full'>
            <div className='flex justify-between mb-1'>
              <Text.H6 color='foregroundMuted'>
                <span
                  className='inline-flex items-center'
                  style={{ paddingLeft: `${node.level * 16}px` }}
                >
                  {node.level > 0 && (
                    <span className='inline-block mr-2'>└─</span>
                  )}
                  {span.name}
                </span>
              </Text.H6>
              <Text.H6 color='foregroundMuted'>
                {formatDuration(spanDuration)}
              </Text.H6>
            </div>
            <div
              className='h-2 bg-secondary rounded-full relative'
              style={{ marginLeft: `${node.level * 16}px` }}
            >
              <div
                className={`absolute h-full ${
                  span.internalType === 'generation' ? 'bg-yellow' : 'bg-purple'
                } rounded-md`}
                style={{
                  left: `${leftPosition}%`,
                  width: `${Math.max(0.5, width)}%`,
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
