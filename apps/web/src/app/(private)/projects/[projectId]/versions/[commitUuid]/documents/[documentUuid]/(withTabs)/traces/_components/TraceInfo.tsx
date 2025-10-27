import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useTrace } from '$/stores/traces'
import {
  CompletionSpanMetadata,
  PromptSpanMetadata,
  SpanType,
} from '@latitude-data/constants'
import { MetadataInfoTabs } from '../../../_components/MetadataInfoTabs'
import { useTraceSpanSelection } from './TraceSpanSelectionContext'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { MessageList } from '$/components/ChatWrapper'
import { adaptPromptlMessageToLegacy } from '@latitude-data/core/utils/promptlAdapter'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/findFirstSpanOfType'
import { findSpanById } from '@latitude-data/core/services/tracing/spans/findSpanById'

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
  const { selection } = useTraceSpanSelection()
  const { data: trace, isLoading } = useTrace({
    traceId: selection.traceId,
  })
  const span = findSpanById(trace?.children ?? [], selection.spanId)
  if (isLoading) return <LoadingText alignX='center' />
  if (!span) return null

  return <DetailsPanel span={span} />
}

function TraceMessages() {
  const { selection } = useTraceSpanSelection()
  const { data: trace } = useTrace({ traceId: selection.traceId! })
  const completionSpan = findFirstSpanOfType(
    trace?.children ?? [],
    SpanType.Completion,
  )
  if (!completionSpan) return null

  const promptSpan = findFirstSpanOfType(trace?.children ?? [], SpanType.Prompt)
  const completionMetadata = completionSpan?.metadata as CompletionSpanMetadata
  const promptMetadata = promptSpan?.metadata as PromptSpanMetadata | undefined
  const legacyMessages = [
    ...(completionMetadata.input || []).map(adaptPromptlMessageToLegacy),
    ...(completionMetadata.output || []).map(adaptPromptlMessageToLegacy),
  ]

  return (
    <MessageList
      debugMode
      messages={legacyMessages}
      parameters={
        promptMetadata?.parameters
          ? Object.keys(promptMetadata.parameters)
          : undefined
      }
    />
  )
}

function TraceEvaluations() {
  return null
}
