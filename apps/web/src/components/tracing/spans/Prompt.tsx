import { MetadataItem } from '$/components/MetadataItem'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { DetailsPanelProps, SPAN_COLORS } from './shared'
import { useSpanCompletionData } from './useSpanCompletionData'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { MessageList } from '$/components/ChatWrapper'
import { SpanParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/traces/_components/SpanParameters'

const specification = SPAN_SPECIFICATIONS[SpanType.Prompt]
export default {
  ...specification,
  icon: 'bot' as IconName,
  color: SPAN_COLORS.blue,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Prompt>) {
  const { aggregatedMetadata, completionSpanMetadata } = useSpanCompletionData({
    traceId: span.traceId,
    spanId: span.id,
  })

  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem label='Version id'>
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
          {span.metadata.externalId && (
            <MetadataItem label='External ID'>
              <ClickToCopy copyValue={span.metadata.externalId}>
                <Text.H5 align='right' color='foregroundMuted'>
                  {span.metadata.externalId.slice(0, 8)}
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
              <MessageList debugMode messages={completionSpanMetadata.output} />
            </div>
          )}
        </>
      )}
    </>
  )
}
