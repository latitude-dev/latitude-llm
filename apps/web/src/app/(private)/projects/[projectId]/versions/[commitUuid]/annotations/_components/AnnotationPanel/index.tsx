import { useMemo } from 'react'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { AnnotationsProvider, MessageList } from '$/components/ChatWrapper'
import {
  HumanEvaluationMetric,
  EvaluationResultV2,
  SpanType,
  SpanWithDetails,
  EvaluationType,
  MainSpanType,
} from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useToolContentMap } from '@latitude-data/web-ui/hooks/useToolContentMap'
import Link from 'next/link'
import { useTrace, useTraceWithMessages } from '$/stores/traces'
import { adaptCompletionSpanMessagesToLegacy } from '@latitude-data/core/services/tracing/spans/fetching/findCompletionSpanFromTrace'
import { Message } from '@latitude-data/constants/messages'
import { sum } from 'lodash-es'
import { RunPanelStats } from '$/components/RunPanelStats'
import { AnnotationFormWithoutContext } from '$/components/ChatWrapper/AnnotationFormWithoutContext'
import { buildTraceUrl } from '../../../documents/[documentUuid]/(withTabs)/traces/_components/TraceSpanSelectionContext'
import { findFirstSpanOfType } from '@latitude-data/core/services/tracing/spans/fetching/findFirstSpanOfType'

export function AnnotationsPanel({
  span,
  onAnnotate,
}: {
  span: SpanWithDetails<MainSpanType>
  onAnnotate: (
    result: EvaluationResultV2<EvaluationType.Human, HumanEvaluationMetric>,
  ) => void
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: trace } = useTrace({ traceId: span.traceId })
  const { completionSpan, isLoading: isLoadingTrace } = useTraceWithMessages({
    traceId: span.traceId,
    spanId: span.id,
  })
  const mainSpan = useMemo(
    () =>
      findFirstSpanOfType(trace?.children ?? [], [
        SpanType.Prompt,
        SpanType.External,
      ]),
    [trace?.children],
  )
  const documentUuid = mainSpan?.documentUuid
  const conversation = useMemo(
    () => adaptCompletionSpanMessagesToLegacy(completionSpan ?? undefined),
    [completionSpan],
  )
  const toolContentMap = useToolContentMap(conversation as unknown as Message[])
  const isLoading = isLoadingTrace
  if (isLoading) {
    return (
      <div className='w-full h-full flex flex-1 justify-center items-center gap-2'>
        <Icon
          name='loader'
          color='foregroundMuted'
          className='animate-spin mt-px stroke-[2.25]'
        />
        <Text.H4M color='foregroundMuted'>Assembling run...</Text.H4M>
      </div>
    )
  }

  const spanMetadata = span.metadata

  return (
    <div className='w-full flex flex-col gap-6 p-6 overflow-hidden overflow-y-auto custom-scrollbar relative'>
      <div className='w-full min-h-0 flex flex-1 flex-col justify-start items-start gap-4'>
        {completionSpan && (
          <RunPanelStats
            tokens={
              sum(Object.values(completionSpan.metadata?.tokens ?? {})) ?? 0
            }
            cost={completionSpan.metadata?.cost ?? 0}
            duration={span.duration ?? 0}
            error={span.status === 'error' ? span.message : undefined}
            isWaiting={false}
            isRunning={false}
          />
        )}
        {documentUuid && (
          <div className='w-full flex justify-center items-center'>
            <Link
              href={buildTraceUrl({
                projectId: project.id,
                commitUuid: commit.uuid,
                documentUuid,
                span,
              })}
              target='_blank'
            >
              <Button
                variant='link'
                iconProps={{
                  name: 'arrowUpRight',
                  widthClass: 'w-4',
                  heightClass: 'h-4',
                  placement: 'right',
                }}
              >
                See complete log
              </Button>
            </Link>
          </div>
        )}
        {conversation.length > 0 ? (
          <div className='w-full flex flex-col'>
            <div className='flex flex-row items-center justify-between w-full pb-2'>
              <Text.H6M>Messages</Text.H6M>
            </div>
            <AnnotationsProvider
              project={project}
              commit={commit}
              span={span}
              messages={conversation as unknown as Message[]}
              onAnnotate={onAnnotate}
            >
              <MessageList
                debugMode
                messages={conversation as unknown as Message[]}
                parameters={
                  spanMetadata && 'parameters' in spanMetadata
                    ? Object.keys(spanMetadata.parameters)
                    : []
                }
                toolContentMap={toolContentMap}
              />
              <AnnotationFormWithoutContext />
            </AnnotationsProvider>
          </div>
        ) : (
          <Text.H5 color='foregroundMuted'>
            No messages generated for this run
          </Text.H5>
        )}
      </div>
    </div>
  )
}
