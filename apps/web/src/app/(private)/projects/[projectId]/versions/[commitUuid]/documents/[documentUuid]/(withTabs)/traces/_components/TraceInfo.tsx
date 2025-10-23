import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useTrace } from '$/stores/traces'
import {
  CompletionSpanMetadata,
  PromptSpanMetadata,
  SpanType,
} from '@latitude-data/constants'
import { MetadataInfoTabs } from '../../../_components/MetadataInfoTabs'
import { useSelectedSpan } from './SelectedSpansContext'
import { useSelectedTraceId } from './SelectedTraceIdContext'
import { useSpan } from '$/stores/spans'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { MessageList } from '$/components/ChatWrapper'
import { adaptPromptlMessageToLegacy } from '@latitude-data/core/utils/promptlAdapter'

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

function findFirstSpanOfType(
  children: any[],
  spanType: SpanType,
): any | undefined {
  if (!children || children.length === 0) return undefined

  const queue = [...children]

  while (queue.length > 0) {
    const current = queue.shift()

    if (current.type === spanType) {
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
    ? findFirstSpanOfType(trace.children, SpanType.Completion)?.id
    : undefined
  const { data: completionSpan, isLoading } = useSpan({
    spanId: spanId,
    traceId: selectedTraceId!,
  })
  const spanIdd = trace?.children
    ? findFirstSpanOfType(trace.children, SpanType.Prompt)?.id
    : undefined
  const { data: promptSpan, isLoading: isLoadingg } = useSpan({
    spanId: spanIdd,
    traceId: selectedTraceId!,
  })
  if (isLoading || isLoadingg) return <LoadingText alignX='center' />
  if (!completionSpan || !promptSpan) return null
  if (
    !completionSpan.metadata ||
    completionSpan.metadata.type !== SpanType.Completion
  ) {
    return null
  }

  const completionMetadata = completionSpan.metadata as CompletionSpanMetadata
  const promptMetadata = promptSpan.metadata as PromptSpanMetadata
  const legacyMessages = [
    ...(completionMetadata.input || []).map(adaptPromptlMessageToLegacy),
    ...(completionMetadata.output || []).map(adaptPromptlMessageToLegacy),
  ]

  return (
    <MessageList
      messages={legacyMessages}
      parameters={Object.keys(promptMetadata.parameters)}
    />
  )
}

function TraceEvaluations() {
  return null
}
