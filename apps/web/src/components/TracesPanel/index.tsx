import { Ref, useMemo } from 'react'
import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useLastTrace } from '$/stores/conversations'
import { SpanType, SpanWithDetails } from '@latitude-data/constants'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { MessageList } from '$/components/ChatWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useSpan } from '$/stores/spans'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { AnnotationForms } from './AnnotationForms'
import { TraceEvaluations } from './TraceEvaluations'
import { MetadataInfoTabs } from '../MetadataInfoTabs'
import { adaptCompletionSpanMessagesToLegacy } from '@latitude-data/core/services/tracing/spans/fetching/findCompletionSpanFromTrace'

export const DEFAULT_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
]

export function TraceInfoPanel({
  ref,
  spanId,
  documentLogUuid,
  documentUuid,
  insideOtherPanel = false,
  mergedToIssueId,
}: {
  spanId: string
  documentLogUuid: string
  documentUuid: string
  insideOtherPanel?: boolean
  mergedToIssueId?: number
  ref?: Ref<HTMLDivElement>
}) {
  const { commit } = useCurrentCommit()
  const document = useMemo(
    () => ({ documentUuid, commitId: commit.id }),
    [documentUuid, commit.id],
  )
  const { project } = useCurrentProject()
  const { data: span, isLoading } = useSpan({
    spanId,
    documentLogUuid,
  })
  const { data: results } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId,
    documentLogUuid,
  })

  const tabs =
    results.length > 0
      ? [...DEFAULT_TABS, { label: 'Evaluations', value: 'evaluations' }]
      : DEFAULT_TABS
  return (
    <MetadataInfoTabs ref={ref} tabs={tabs} insideOtherPanel={insideOtherPanel}>
      {({ selectedTab }) => (
        <>
          {selectedTab === 'metadata' && (
            <TraceMetadata
              isLoading={isLoading}
              span={span}
              mergedToIssueId={mergedToIssueId}
            />
          )}
          {selectedTab === 'messages' && (
            <TraceMessages documentLogUuid={documentLogUuid} />
          )}
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
  )
}

function TraceMetadata({
  span,
  isLoading,
  mergedToIssueId,
}: {
  span?: SpanWithDetails<SpanType> | null
  isLoading: boolean
  mergedToIssueId?: number
}) {
  if (isLoading) return <LoadingText alignX='center' />
  if (!span) return null

  return (
    <div className='flex flex-col gap-4'>
      <DetailsPanel span={span} />
      {span.type === SpanType.Prompt && (
        <AnnotationForms
          span={span as SpanWithDetails<SpanType.Prompt>}
          mergedToIssueId={mergedToIssueId}
        />
      )}
    </div>
  )
}

function TraceMessages({
  documentLogUuid,
}: {
  documentLogUuid: string | null
}) {
  const { completionSpan, isLoading } = useLastTrace({ documentLogUuid })
  const messages = adaptCompletionSpanMessagesToLegacy(
    completionSpan ?? undefined,
  )

  if (isLoading) {
    return <LoadingText alignX='center' />
  }

  if (!messages.length) {
    return (
      <div className='flex flex-row items-center justify-center w-full'>
        <Text.H6M color='foregroundMuted'>No messages</Text.H6M>
      </div>
    )
  }

  return <MessageList debugMode messages={messages} />
}
