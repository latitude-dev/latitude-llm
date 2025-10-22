import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useTrace } from '$/stores/traces'
import { CompletionSpanMetadata, SpanType } from '@latitude-data/constants'
import { MetadataInfoTabs } from '../../../_components/MetadataInfoTabs'
import { useSelectedSpan } from './SelectedSpansContext'
import { useSelectedTraceId } from './SelectedTraceIdContext'
import { useSpan } from '$/stores/spans'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { PromptlMessageList } from './TracePromptlMessages'

export const DEFAULT_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
  { label: 'Evaluations', value: 'evaluations' },
]

export function TraceInfo() {
  return (
    <div className='flex flex-col gap-4'>
      <MetadataInfoTabs tabs={DEFAULT_TABS}>
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && <TraceMetadata />}
            {selectedTab === 'messages' && <TraceMessages />}
            {selectedTab === 'evaluations' && <TraceEvaluations />}
          </>
        )}
      </MetadataInfoTabs>
    </div>
  )
}

function TraceMetadata() {
  const { selectedTraceId } = useSelectedTraceId()
  const { selectedSpanId } = useSelectedSpan()
  const { data: span } = useSpan({
    spanId: selectedSpanId,
    traceId: selectedTraceId,
  })
  if (!span) return null

  return <DetailsPanel span={span} />
}

function findFirstCompletionSpan(children: any[]): any | undefined {
  if (!children || children.length === 0) return undefined

  const queue = [...children]

  while (queue.length > 0) {
    const current = queue.shift()

    if (current.type === SpanType.Completion) {
      return current
    }

    if (current.children && current.children.length > 0) {
      queue.push(...current.children)
    }
  }

  return undefined
}

function TraceMessages() {
  const { selectedTraceId } = useSelectedTraceId()
  const { data: trace } = useTrace({ traceId: selectedTraceId! })
  const spanId = trace?.children
    ? findFirstCompletionSpan(trace.children)?.id
    : undefined
  const { data: span, isLoading } = useSpan({
    spanId: spanId,
    traceId: selectedTraceId!,
  })
  if (isLoading) return <LoadingText alignX='center' />
  if (!span) return null

  // Only CompletionSpanMetadata has input/output properties
  if (!span.metadata || span.metadata.type !== SpanType.Completion) {
    return null
  }

  const completionMetadata = span.metadata as CompletionSpanMetadata
  return (
    <PromptlMessageList
      messages={[
        ...(completionMetadata.input || []),
        ...(completionMetadata.output || []),
      ]}
    />
  )
}

function TraceEvaluations() {
  return null
}
