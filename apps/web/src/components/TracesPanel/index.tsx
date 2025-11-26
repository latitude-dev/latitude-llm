import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useTrace } from '$/stores/traces'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { MessageList } from '$/components/ChatWrapper'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/findFirstSpanOfType'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useSpan } from '$/stores/spans'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { AnnotationForms } from './AnnotationForms'
import { TraceEvaluations } from './TraceEvaluations'
import { MetadataInfoTabs } from '../MetadataInfoTabs'
import { useMemo } from 'react'
import {
  adaptCompletionSpanMessagesToLegacy,
  findCompletionSpanFromTrace,
} from '@latitude-data/core/services/tracing/spans/findCompletionSpanFromTrace'

export const DEFAULT_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
]

export function TraceInfoPanel({
  spanId,
  traceId,
  documentUuid,
  insideOtherPanel = false,
}: {
  spanId: string
  traceId: string
  documentUuid: string
  insideOtherPanel?: boolean
}) {
  const { commit } = useCurrentCommit()
  const document = useMemo(
    () => ({ documentUuid, commitId: commit.id }),
    [documentUuid, commit.id],
  )
  const { project } = useCurrentProject()
  const { data: span, isLoading } = useSpan({
    spanId,
    traceId,
  })
  const { data: results } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId,
    traceId,
  })

  const tabs =
    results.length > 0
      ? [...DEFAULT_TABS, { label: 'Evaluations', value: 'evaluations' }]
      : DEFAULT_TABS

  return (
    <div className='flex flex-col gap-4'>
      <MetadataInfoTabs tabs={tabs} insideOtherPanel={insideOtherPanel}>
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && (
              <TraceMetadata isLoading={isLoading} span={span} />
            )}
            {selectedTab === 'messages' && <TraceMessages traceId={traceId} />}
            {selectedTab === 'evaluations' && (
              <TraceEvaluations
                documentUuid={documentUuid}
                span={span}
                results={results}
              />
            )}
          </>
        )}
      </MetadataInfoTabs>
    </div>
  )
}

function TraceMetadata({
  span,
  isLoading,
}: {
  span?: SpanWithDetails<SpanType> | null
  isLoading: boolean
}) {
  if (isLoading) return <LoadingText alignX='center' />
  if (!span) return null

  return (
    <div className='flex flex-col gap-4'>
      <DetailsPanel span={span} />
      {span.type === SpanType.Prompt && (
        <AnnotationForms span={span as SpanWithDetails<SpanType.Prompt>} />
      )}
    </div>
  )
}

function TraceMessages({ traceId }: { traceId: string | null }) {
  const { data: trace } = useTrace({ traceId })
  const promptSpan = findFirstSpanOfType(trace?.children ?? [], SpanType.Prompt)
  const promptMetadata = promptSpan?.metadata
  const completionSpan = findCompletionSpanFromTrace(trace)
  const messages = adaptCompletionSpanMessagesToLegacy(completionSpan)
  if (!messages.length) {
    return (
      <div className='flex flex-row items-center justify-center w-full'>
        <Text.H6M color='foregroundMuted'>No messages</Text.H6M>
      </div>
    )
  }

  return (
    <MessageList
      debugMode
      messages={messages}
      parameters={
        promptMetadata?.parameters
          ? Object.keys(promptMetadata.parameters)
          : undefined
      }
    />
  )
}
