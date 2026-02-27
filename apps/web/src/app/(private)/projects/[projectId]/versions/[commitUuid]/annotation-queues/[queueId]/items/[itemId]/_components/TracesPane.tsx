'use client'

import { useAnnotationQueueItemTraces } from '$/stores/annotationQueues/annotationQueueItemTraces'
import { TraceDetailCard } from './TraceDetailCard'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

export function TracesPane({
  traceId,
  projectId,
}: {
  traceId: string
  projectId: number
}) {
  const { traces, isMultiTrace, isLoading } = useAnnotationQueueItemTraces({
    traceId,
    projectId,
  })
  if (isLoading) {
    return (
      <div className='flex items-center justify-center gap-2 h-full'>
        <Icon name='loader' color='foregroundMuted' className='animate-spin' />
        <Text.H5 color='foregroundMuted'>Loading traces</Text.H5>
      </div>
    )
  }

  if (traces.length === 0) {
    return (
      <div className='flex items-center justify-center h-full'>
        <Text.H5 color='foregroundMuted'>No traces found</Text.H5>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      {isMultiTrace && (
        <Text.H6 color='foregroundMuted'>
          {traces.length} traces in conversation
        </Text.H6>
      )}
      <div className='flex flex-col gap-y-2 w-full divide-y divide-border'>
        {traces.map((trace, index) => (
          <div className='pt-2' key={trace.id}>
            <TraceDetailCard
              trace={trace}
              collapsible={isMultiTrace}
              defaultExpanded={index === 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
