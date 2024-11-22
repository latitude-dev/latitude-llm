'use client'

import { useMemo } from 'react'
import { toUpper } from 'lodash-es'

import { TraceWithSpans, Workspace } from '@latitude-data/core/browser'
import { Badge, ClickToCopyUuid, Text } from '@latitude-data/web-ui'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { format } from 'date-fns'

import { MetadataInfoTabs } from '../../../../(commit)/documents/[documentUuid]/_components/MetadataInfoTabs'
import { MetadataItem } from '../../../../(commit)/documents/[documentUuid]/_components/MetadataItem'
import { SpanTimeline } from './SpanTimeline'
import { TraceMessages } from './TraceMessages'

type Props = {
  projectId: number
  traceId: string
  workspace: Workspace
  trace: TraceWithSpans
}

function TraceMetadata({ trace }: { trace: TraceWithSpans }) {
  const duration = trace.endTime
    ? new Date(trace.endTime).getTime() - new Date(trace.startTime).getTime()
    : undefined

  const generationSpan = useMemo(() => {
    if (trace.spans.length !== 1) return null
    const span = trace.spans[0]
    return span?.internalType === 'generation' ? span : null
  }, [trace.spans])

  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Trace ID'>
        <ClickToCopyUuid uuid={trace.traceId} />
      </MetadataItem>
      <MetadataItem label='Status'>
        <Badge
          variant={trace.status === 'error' ? 'destructive' : 'success'}
          shape='square'
        >
          <Text.H6 noWrap>{toUpper(trace.status || 'ok')}</Text.H6>
        </Badge>
      </MetadataItem>
      <MetadataItem
        label='Start Time'
        value={format(new Date(trace.startTime), 'PPp')}
      />
      <MetadataItem
        label='Duration'
        value={duration ? formatDuration(duration) : '-'}
      />

      {generationSpan && (
        <>
          {generationSpan.model && (
            <MetadataItem label='Model' value={generationSpan.model} />
          )}
          {generationSpan.totalCostInMillicents && (
            <MetadataItem
              label='Cost'
              value={formatCostInMillicents(
                generationSpan.totalCostInMillicents,
              )}
            />
          )}
        </>
      )}
    </div>
  )
}

export function TraceInfo({ trace }: Props) {
  const hasGenerationSpan = useMemo(() => {
    return trace.spans.some((span) => span.internalType === 'generation')
  }, [trace.spans])

  return (
    <div className='relative border border-border rounded-lg overflow-hidden'>
      <MetadataInfoTabs
        tabs={[
          { label: 'Metadata', value: 'metadata' },
          ...(hasGenerationSpan
            ? [{ label: 'Messages', value: 'messages' }]
            : []),
          ...(trace.spans.length > 1
            ? [{ label: 'Timeline', value: 'timeline' }]
            : []),
        ]}
      >
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && <TraceMetadata trace={trace} />}
            {selectedTab === 'messages' && <TraceMessages trace={trace} />}
            {selectedTab === 'timeline' && trace.spans.length > 1 && (
              <SpanTimeline trace={trace} />
            )}
          </>
        )}
      </MetadataInfoTabs>
    </div>
  )
}
