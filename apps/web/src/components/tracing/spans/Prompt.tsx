import { MetadataItem } from '$/components/MetadataItem'
import {
  CompletionSpanMetadata,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { DetailsPanelProps, SPAN_COLORS } from './shared'
import { useTrace } from '$/stores/traces'
import { findAllSpansOfType } from '@latitude-data/core/services/tracing/spans/findAllSpansOfType'
import { useMemo } from 'react'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { SpanParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/logs/_components/DocumentLogs/DocumentLogInfo/Metadata'
import { findLastSpanOfType } from '@latitude-data/core/services/tracing/spans/findLastSpanOfType'
import { MessageList } from '$/components/ChatWrapper'
import { adaptPromptlMessageToLegacy } from '@latitude-data/core/utils/promptlAdapter'

const specification = SPAN_SPECIFICATIONS[SpanType.Prompt]
export default {
  ...specification,
  icon: 'bot' as IconName,
  color: SPAN_COLORS.gray,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Prompt>) {
  const { data: trace } = useTrace({ traceId: span.traceId })
  const completionSpan = useMemo(
    () => findLastSpanOfType(trace?.children ?? [], SpanType.Completion),
    [trace],
  )
  const completionSpans = useMemo(
    () => findAllSpansOfType(trace?.children ?? [], SpanType.Completion),
    [trace],
  )
  const aggregatedMetadata = useMemo(() => {
    if (!completionSpans.length) return undefined

    type AggregatedData = {
      finishReason?: CompletionSpanMetadata['finishReason']
      cost: number
      tokens: {
        prompt: number
        cached: number
        reasoning: number
        completion: number
      }
    }

    return completionSpans.reduce<AggregatedData>(
      (acc, span) => {
        const metadata = span.metadata as CompletionSpanMetadata | undefined
        if (!metadata) return acc

        return {
          finishReason: metadata.finishReason,
          cost: acc.cost + (metadata.cost || 0),
          tokens: {
            prompt: acc.tokens.prompt + (metadata.tokens?.prompt || 0),
            cached: acc.tokens.cached + (metadata.tokens?.cached || 0),
            reasoning: acc.tokens.reasoning + (metadata.tokens?.reasoning || 0),
            completion:
              acc.tokens.completion + (metadata.tokens?.completion || 0),
          },
        }
      },
      {
        finishReason: undefined,
        cost: 0,
        tokens: { prompt: 0, cached: 0, reasoning: 0, completion: 0 },
      },
    )
  }, [completionSpans])
  const completionSpanMetadata = completionSpan?.metadata as
    | CompletionSpanMetadata
    | undefined

  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem label='Version UUID'>
            <ClickToCopy copyValue={span.metadata.versionUuid as string}>
              <Text.H5 align='right' color='foregroundMuted'>
                {(span.metadata.versionUuid as string).slice(0, 8)}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
          {span.metadata.promptUuid && (
            <MetadataItem label='Prompt UUID'>
              <ClickToCopy copyValue={span.metadata.promptUuid as string}>
                <Text.H5 align='right' color='foregroundMuted'>
                  {(span.metadata.promptUuid as string).slice(0, 8)}
                </Text.H5>
              </ClickToCopy>
            </MetadataItem>
          )}
          {span.metadata.experimentUuid && (
            <MetadataItem label='Experiment UUID'>
              <ClickToCopy copyValue={span.metadata.experimentUuid as string}>
                <Text.H5 align='right' color='foregroundMuted'>
                  {(span.metadata.experimentUuid as string).slice(0, 8)}
                </Text.H5>
              </ClickToCopy>
            </MetadataItem>
          )}
          {aggregatedMetadata && (
            <>
              {aggregatedMetadata.finishReason && (
                <MetadataItem label='Finish reason'>
                  <Text.H5 align='right' color='foregroundMuted'>
                    {aggregatedMetadata.finishReason}
                  </Text.H5>
                </MetadataItem>
              )}
              <MetadataItem
                label='Cost'
                value={formatCostInMillicents(aggregatedMetadata.cost!)}
                tooltip="We estimate the cost based on the token usage and your provider's pricing. Actual cost may vary."
              />
              <MetadataItem
                label='Tokens'
                value={(
                  aggregatedMetadata.tokens!.prompt +
                  aggregatedMetadata.tokens!.cached +
                  aggregatedMetadata.tokens!.reasoning +
                  aggregatedMetadata.tokens!.completion
                ).toString()}
                tooltip={
                  <div className='w-full flex flex-col justify-between'>
                    <div className='w-full flex flex-row justify-between items-center gap-4'>
                      <Text.H6B color='background'>Prompt</Text.H6B>
                      <Text.H6 color='background'>
                        {aggregatedMetadata.tokens!.prompt}
                      </Text.H6>
                    </div>
                    <div className='w-full flex flex-r!ow justify-between items-center gap-4'>
                      <Text.H6B color='background'>Cached</Text.H6B>
                      <Text.H6 color='background'>
                        {aggregatedMetadata.tokens!.cached}
                      </Text.H6>
                    </div>
                    <div className='w-full flex flex-r!ow justify-between items-center gap-4'>
                      <Text.H6B color='background'>Reasoning</Text.H6B>
                      <Text.H6 color='background'>
                        {aggregatedMetadata.tokens!.reasoning}
                      </Text.H6>
                    </div>
                    <div className='w-full flex flex-r!ow justify-between items-center gap-4'>
                      <Text.H6B color='background'>Completion</Text.H6B>
                      <Text.H6 color='background'>
                        {aggregatedMetadata.tokens!.completion}
                      </Text.H6>
                    </div>
                  </div>
                }
              />
            </>
          )}
          <SpanParameters span={span} />
          {completionSpanMetadata?.output && (
            <div className='flex flex-col gap-y-1'>
              <Text.H5M color='foreground'>Last output</Text.H5M>
              <MessageList
                debugMode
                messages={completionSpanMetadata.output.map(
                  adaptPromptlMessageToLegacy,
                )}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}
