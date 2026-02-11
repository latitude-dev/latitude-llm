import { MetadataItem, MetadataItemTooltip } from '$/components/MetadataItem'
import { CostBreakdownDisplay } from '$/components/CostBreakdownDisplay'
import {
  CompletionSpanMetadata,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '@latitude-data/constants'
import {
  CostBreakdown,
  emptyCostBreakdown,
  mergeCostBreakdown,
} from '@latitude-data/constants/costs'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import {
  DetailsPanelProps,
  SPAN_COLORS,
  SpanFrontendSpecification,
} from './shared'
import { buildSpanCostBreakdown } from './costBreakdownFromSpan'
import { useTrace } from '$/stores/traces'
import { findAllSpansOfType } from '@latitude-data/core/services/tracing/spans/fetching/findAllSpansOfType'
import { findLastSpanOfType } from '@latitude-data/core/services/tracing/spans/fetching/findLastSpanOfType'
import { useMemo } from 'react'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { MessageList } from '$/components/ChatWrapper'

const specification = SPAN_SPECIFICATIONS[SpanType.Chat]
export default {
  ...specification,
  icon: 'messageSquareText',
  color: SPAN_COLORS.blue,
  DetailsPanel: DetailsPanel,
} satisfies SpanFrontendSpecification<SpanType.Chat>

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Chat>) {
  const { data: trace } = useTrace({ traceId: span.traceId })
  const completionSpan = useMemo(() => {
    if (!trace) return undefined

    return findLastSpanOfType({
      children: trace.children,
      spanType: SpanType.Completion,
    })
  }, [trace])
  const completionSpans = useMemo(
    () => findAllSpansOfType(trace?.children ?? [], SpanType.Completion),
    [trace],
  )
  const aggregatedMetadata = useMemo(() => {
    if (!completionSpans.length) return undefined

    type AggregatedData = {
      finishReason?: CompletionSpanMetadata['finishReason']
      costMillicents: number
      costBreakdown: CostBreakdown
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

        const spanBreakdown = buildSpanCostBreakdown(metadata)

        return {
          finishReason: metadata.finishReason,
          costMillicents: acc.costMillicents + (metadata.cost || 0),
          costBreakdown: mergeCostBreakdown(acc.costBreakdown, spanBreakdown),
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
        costMillicents: 0,
        costBreakdown: emptyCostBreakdown(),
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
          <MetadataItem label='Document Log UUID'>
            <ClickToCopy copyValue={span.metadata.documentLogUuid}>
              <Text.H5 align='right' color='foregroundMuted'>
                {span.metadata.documentLogUuid.slice(0, 8)}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
          {span.metadata.previousTraceId && (
            <MetadataItem label='Previous Trace ID'>
              <ClickToCopy copyValue={span.metadata.previousTraceId}>
                <Text.H5 align='right' color='foregroundMuted'>
                  {span.metadata.previousTraceId.slice(0, 8)}
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
              {Object.keys(aggregatedMetadata.costBreakdown).length > 0 ? (
                <MetadataItemTooltip
                  label='Cost'
                  trigger={
                    <Text.H5 align='right' color='foregroundMuted'>
                      {formatCostInMillicents(aggregatedMetadata.costMillicents)}
                    </Text.H5>
                  }
                  tooltipContent={
                    <CostBreakdownDisplay
                      breakdown={aggregatedMetadata.costBreakdown}
                      color='background'
                    />
                  }
                />
              ) : (
                <MetadataItem
                  label='Cost'
                  value={formatCostInMillicents(aggregatedMetadata.costMillicents)}
                  tooltip="We estimate the cost based on the token usage and your provider's pricing. Actual cost may vary."
                />
              )}
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
                    <div className='w-full flex flex-row justify-between items-center gap-4'>
                      <Text.H6B color='background'>Cached</Text.H6B>
                      <Text.H6 color='background'>
                        {aggregatedMetadata.tokens!.cached}
                      </Text.H6>
                    </div>
                    <div className='w-full flex flex-row justify-between items-center gap-4'>
                      <Text.H6B color='background'>Reasoning</Text.H6B>
                      <Text.H6 color='background'>
                        {aggregatedMetadata.tokens!.reasoning}
                      </Text.H6>
                    </div>
                    <div className='w-full flex flex-row justify-between items-center gap-4'>
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
          {completionSpanMetadata?.output && (
            <div className='flex flex-col gap-y-1'>
              <Text.H5M color='foreground'>Last output</Text.H5M>
              <MessageList debugMode messages={completionSpanMetadata.output} />
            </div>
          )}
        </>
      )}
    </>
  )
}
