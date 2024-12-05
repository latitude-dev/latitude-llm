import { TraceWithSpans } from '@latitude-data/core/browser'
import { Badge, ClickToCopyUuid, Text, CodeBlock } from '@latitude-data/web-ui'
import { formatCostInMillicents, formatDuration } from '$/app/_lib/formatUtils'
import { format } from 'date-fns'
import { MetadataItem } from '../../../../(commit)/documents/[documentUuid]/_components/MetadataItem'
import { calculateTraceMetrics } from './utils'

type Props = {
  trace: TraceWithSpans
}

export function TraceMetadata({ trace }: Props) {
  const { totalDuration, totalCost, totalTokens, models } =
    calculateTraceMetrics(trace)

  // Find the first span with Latitude-specific attributes
  const latitudeSpan = trace.spans.find(
    (span) => span.promptPath || span.distinctId || span.metadata,
  )

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
      <MetadataItem label='Models'>
        <div className='flex flex-wrap gap-1'>
          {models.length > 0 ? (
            models.map((model: string) => (
              <Badge key={model} variant='secondary'>
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

      {latitudeSpan?.promptPath && (
        <MetadataItem label='Prompt'>
          <Badge variant='accent'>{latitudeSpan.promptPath}</Badge>
        </MetadataItem>
      )}
      {latitudeSpan?.distinctId && (
        <MetadataItem label='Distinct ID' value={latitudeSpan.distinctId} />
      )}
      {latitudeSpan?.metadata && (
        <MetadataItem label='Metadata'>
          <CodeBlock language='json' copy={true}>
            {JSON.stringify(latitudeSpan.metadata, null, 2)}
          </CodeBlock>
        </MetadataItem>
      )}
    </div>
  )
}
