import { MetadataItem } from '$/components/MetadataItem'
import { SpanType } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { DetailsPanelProps } from '../shared'
import { useAggregatedCompletionSpans } from './aggregateCompletionSpans'
import { MessageList } from '$/components/ChatWrapper'
import { TraceCostDetail } from './Cost'

export function AggregatedCompletionsDetails({
  span,
}: DetailsPanelProps<SpanType>) {
  const {
    completionSpan,
    costBreakdown,
    isLoading,
    totalCost,
    tokens,
    finishReason,
  } = useAggregatedCompletionSpans({ traceId: span.traceId, spanId: span.id })

  return (
    <>
      {tokens && (
        <>
          {finishReason && (
            <MetadataItem label='Finish reason'>
              <Text.H5 align='right' color='foregroundMuted'>
                {finishReason}
              </Text.H5>
            </MetadataItem>
          )}
          <MetadataItem
            label='Tokens'
            value={(
              tokens.prompt +
              tokens.cached +
              tokens.reasoning +
              tokens.completion
            ).toString()}
            tooltip={
              <div className='w-full flex flex-col justify-between'>
                <div className='w-full flex flex-row justify-between items-center gap-4'>
                  <Text.H6B color='background'>Prompt</Text.H6B>
                  <Text.H6 color='background'>{tokens.prompt}</Text.H6>
                </div>
                <div className='w-full flex flex-row justify-between items-center gap-4'>
                  <Text.H6B color='background'>Cached</Text.H6B>
                  <Text.H6 color='background'>{tokens.cached}</Text.H6>
                </div>
                <div className='w-full flex flex-row justify-between items-center gap-4'>
                  <Text.H6B color='background'>Reasoning</Text.H6B>
                  <Text.H6 color='background'>{tokens.reasoning}</Text.H6>
                </div>
                <div className='w-full flex flex-row justify-between items-center gap-4'>
                  <Text.H6B color='background'>Completion</Text.H6B>
                  <Text.H6 color='background'>{tokens.completion}</Text.H6>
                </div>
              </div>
            }
          />
        </>
      )}
      <TraceCostDetail
        costBreakdown={costBreakdown}
        isLoading={isLoading}
        totalCost={totalCost}
      />
      {completionSpan?.metadata?.output && (
        <div className='flex flex-col gap-y-1'>
          <Text.H5M color='foreground'>Last output</Text.H5M>
          <MessageList debugMode messages={completionSpan.metadata.output} />
        </div>
      )}
    </>
  )
}
