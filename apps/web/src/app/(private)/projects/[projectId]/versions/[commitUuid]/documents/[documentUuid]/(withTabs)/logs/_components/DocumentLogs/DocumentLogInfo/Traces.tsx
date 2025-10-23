import { formatDuration } from '$/app/_lib/formatUtils'
import {
  OnSelectedSpanFn,
  Timeline,
} from '$/components/tracing/traces/Timeline'
import { relativeTime } from '$/lib/relativeTime'
import { useConversation } from '$/stores/conversations'
import { useTrace } from '$/stores/traces'
import { DocumentLogWithMetadataAndError } from '@latitude-data/core/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { cn } from '@latitude-data/web-ui/utils'
import { useState } from 'react'

function DocumentLogTrace({
  traceId,
  onSelectedSpan,
  expanded,
  setExpanded,
  isFirst,
  isLast,
}: {
  traceId: string
  onSelectedSpan?: OnSelectedSpanFn
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  isFirst: boolean
  isLast: boolean
}) {
  const { data: trace, isLoading } = useTrace({ traceId })

  if (isLoading) {
    if (!isFirst) return null
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4 bg-secondary'>
        <Icon name='loader' color='foregroundMuted' className='animate-spin' />
        <Text.H5 color='foregroundMuted'>Assembling trace</Text.H5>
      </div>
    )
  }

  if (!trace || trace.children.length < 1) {
    if (!isFirst) return null
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4 bg-secondary'>
        <Text.H5 color='foregroundMuted'>No events found so far</Text.H5>
      </div>
    )
  }

  return (
    <CollapsibleBox
      title={
        <div className='flex items-center gap-2 select-none'>
          <Text.H5 color={expanded ? 'foreground' : 'foregroundMuted'}>
            {relativeTime(new Date(trace.startedAt))} •{' '}
            {formatDuration(trace.duration)} • {trace.spans} events
          </Text.H5>
          <div onClick={(e) => e.stopPropagation()}>
            <ClickToCopyUuid uuid={trace.id} />
          </div>
        </div>
      }
      icon='chartNoAxesGantt'
      handlePosition='left'
      isExpanded={expanded}
      onToggle={setExpanded}
      scrollable={false}
      expandedContent={
        <div className='w-full h-full max-h-96 overflow-y-auto custom-scrollbar'>
          <Timeline trace={trace} onSelectedSpan={onSelectedSpan} />
        </div>
      }
      className={cn('!rounded-none !border-0 !border-b', {
        '!border-b-0': isLast,
      })}
      headerClassName={cn('!bg-secondary text-muted-foreground', {
        'text-foreground': expanded,
      })}
      headerDivider={true}
      paddingLeft={false}
      paddingRight={false}
      paddingBottom={false}
    />
  )
}

export function DocumentLogTraces({
  documentLog,
  onSelectedSpan,
}: {
  documentLog: DocumentLogWithMetadataAndError
  onSelectedSpan?: OnSelectedSpanFn
}) {
  const { data: traceIds, isLoading } = useConversation({
    conversationId: documentLog.uuid,
  })

  const [expanded, setExpanded] = useState<number>(0)

  if (isLoading) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4 bg-secondary'>
        <Icon name='loader' color='foregroundMuted' className='animate-spin' />
        <Text.H5 color='foregroundMuted'>Loading traces</Text.H5>
      </div>
    )
  }

  if (traceIds.length < 1) {
    return (
      <div className='w-full h-full flex items-center justify-center gap-2 p-4 bg-secondary'>
        <Text.H5 color='foregroundMuted'>No traces found so far</Text.H5>
      </div>
    )
  }

  return (
    <div className='w-full h-full flex flex-col items-center justify-center'>
      {traceIds.map((traceId, index) => (
        <DocumentLogTrace
          key={`${documentLog.uuid}-${traceId}`}
          traceId={traceId}
          onSelectedSpan={onSelectedSpan}
          expanded={expanded === index}
          setExpanded={(expanded) => setExpanded(expanded ? index : -1)}
          isFirst={index === 0}
          isLast={index === traceIds.length - 1}
        />
      ))}
    </div>
  )
}
