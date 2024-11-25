'use client'

import { useMemo } from 'react'

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

function calculateGenerationMetrics(spans?: TraceWithSpans['spans']) {
  if (!spans) return { totalTokens: 0, totalCost: 0 }

  return spans.reduce(
    (acc, span) => {
      if (span.internalType === 'generation') {
        const cost = span.totalCostInMillicents ?? 0
        const tokens = span.totalTokens ?? 0

        return {
          totalCost: acc.totalCost + cost,
          totalTokens: acc.totalTokens + tokens,
        }
      }
      return acc
    },
    { totalTokens: 0, totalCost: 0 },
  )
}

function getUniqueSpanAttributes(
  spans: TraceWithSpans['spans'],
  attribute: string,
) {
  if (!spans) return []

  const uniqueValues = new Set(
    spans.map((span) => span.attributes?.[attribute]).filter(Boolean),
  )

  return Array.from(uniqueValues)
}

function calculateTraceMetrics(trace: TraceWithSpans) {
  const totalDuration = trace.spans?.length
    ? Math.max(
        ...trace.spans.map((s) =>
          s.endTime ? new Date(s.endTime).getTime() : 0,
        ),
      ) - Math.min(...trace.spans.map((s) => new Date(s.startTime).getTime()))
    : undefined

  const { totalCost, totalTokens } = calculateGenerationMetrics(trace.spans)

  const providers = getUniqueSpanAttributes(trace.spans, 'gen_ai.system')
  const models = getUniqueSpanAttributes(trace.spans, 'gen_ai.request.model')

  return {
    totalDuration,
    totalCost,
    totalTokens,
    providers,
    models,
  }
}

function TraceMetadata({ trace }: { trace: TraceWithSpans }) {
  const { totalDuration, totalCost, totalTokens, providers, models } =
    calculateTraceMetrics(trace)

  return (
    <div className='flex flex-col gap-4'>
      <MetadataItem label='Trace ID'>
        <ClickToCopyUuid uuid={trace.traceId} />
      </MetadataItem>
      <MetadataItem
        label='Start Time'
        value={format(new Date(trace.startTime), 'PPp')}
      />
      <MetadataItem
        label='Duration'
        value={totalDuration ? formatDuration(totalDuration) : '-'}
      />
      <MetadataItem label='Providers'>
        <div className='flex flex-wrap gap-1'>
          {providers.length > 0 ? (
            providers.map((provider) => (
              <Badge key={provider as string} variant='secondary' size='sm'>
                <Text.H6 noWrap>{provider}</Text.H6>
              </Badge>
            ))
          ) : (
            <Text.H5 noWrap>-</Text.H5>
          )}
        </div>
      </MetadataItem>
      <MetadataItem label='Models'>
        <div className='flex flex-wrap gap-1'>
          {models.length > 0 ? (
            models.map((model) => (
              <Badge key={model as string} variant='secondary' size='sm'>
                <Text.H6 noWrap>{model}</Text.H6>
              </Badge>
            ))
          ) : (
            <Text.H5 noWrap>-</Text.H5>
          )}
        </div>
      </MetadataItem>
      <MetadataItem
        label='Total Tokens'
        value={totalTokens ? totalTokens.toString() : '-'}
      />
      <MetadataItem
        label='Total Cost'
        value={totalCost ? formatCostInMillicents(totalCost) : '-'}
      />
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
