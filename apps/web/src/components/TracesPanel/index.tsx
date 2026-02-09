import { Ref, useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { MetadataInfoTabs } from '../MetadataInfoTabs'
import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { AnnotationsProvider, MessageList } from '$/components/ChatWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import {
  AssembledSpan,
  AssembledTrace,
  isMainSpan,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { useSpan } from '$/stores/spans'
import { TraceEvaluationsTab } from './TraceEvaluations'
import { useTraceWithMessages } from '$/stores/traces'
import { adaptCompletionSpanMessagesToLegacy } from '@latitude-data/core/services/tracing/spans/fetching/findCompletionSpanFromTrace'
import { AnnotationFormWithoutContext } from '../ChatWrapper/AnnotationFormWithoutContext'

const TRACE_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
  { label: 'Evaluations', value: 'evaluations' },
]

export function TraceInfoPanel({
  ref,
  spanId,
  documentLogUuid,
  documentUuid,
  insideOtherPanel = false,
}: {
  spanId: string
  documentLogUuid: string
  documentUuid: string
  insideOtherPanel?: boolean
  ref?: Ref<HTMLDivElement>
}) {
  const { data: span, isLoading } = useSpan({
    spanId,
    documentLogUuid,
  })

  return (
    <MetadataInfoTabs
      ref={ref}
      tabs={TRACE_TABS}
      insideOtherPanel={insideOtherPanel}
    >
      {({ selectedTab }) => (
        <>
          {selectedTab === 'metadata' && (
            <TraceMetadata
              isLoading={isLoading}
              span={span}
              documentLogUuid={documentLogUuid}
            />
          )}
          {selectedTab === 'messages' && <TraceMessages span={span} />}
          {selectedTab === 'evaluations' && (
            <TraceEvaluationsTab
              documentUuid={documentUuid}
              spanId={spanId}
              documentLogUuid={documentLogUuid}
              span={span}
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
  documentLogUuid,
}: {
  span?: SpanWithDetails<SpanType> | null
  isLoading: boolean
  documentLogUuid: string
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()

  if (isLoading) return <LoadingText alignX='center' />
  if (!span) return null

  return (
    <div className='flex flex-col gap-4'>
      {span.type === SpanType.Prompt ? (
        <AnnotationsProvider
          span={span as SpanWithDetails<SpanType.Prompt>}
          commit={commit}
          project={project}
        >
          <div className='flex flex-col gap-4'>
            <DetailsPanel span={span} documentLogUuid={documentLogUuid} />
            <AnnotationFormWithoutContext />
          </div>
        </AnnotationsProvider>
      ) : (
        <DetailsPanel span={span} documentLogUuid={documentLogUuid} />
      )}
    </div>
  )
}

function TraceMessages({ span }: { span?: SpanWithDetails }) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { trace, completionSpan, isLoading } = useTraceWithMessages({
    traceId: span?.traceId ?? null,
    spanId: span?.id ?? null,
  })
  const mainSpan = findMainSpan(trace ?? undefined)
  const mainMetadata = mainSpan?.metadata
  const messages = adaptCompletionSpanMessagesToLegacy(
    completionSpan ?? undefined,
  )
  const parameters = useMemo(
    () =>
      mainMetadata && 'parameters' in mainMetadata
        ? Object.keys(mainMetadata.parameters as Record<string, unknown>)
        : undefined,
    [mainMetadata],
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

  return (
    <AnnotationsProvider
      project={project}
      commit={commit}
      span={span}
      messages={messages}
    >
      <div className='flex flex-col gap-4'>
        <MessageList
          debugMode
          messages={messages}
          parameters={parameters ? Object.keys(parameters) : undefined}
        />
        <AnnotationFormWithoutContext />
      </div>
    </AnnotationsProvider>
  )
}

function findMainSpan(
  trace: AssembledTrace | undefined,
): AssembledSpan | undefined {
  if (!trace) return undefined
  return trace.children.find((span) => isMainSpan(span))
}
