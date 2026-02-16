import { MetadataItem } from '$/components/MetadataItem'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { DetailsPanelProps, SPAN_COLORS } from './shared'
import { useSpanCompletionData } from './useSpanCompletionData'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { MessageList } from '$/components/ChatWrapper'

const specification = SPAN_SPECIFICATIONS[SpanType.External]
export default {
  ...specification,
  icon: 'externalLink' as IconName,
  color: SPAN_COLORS.blue,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.External>) {
  const { aggregatedMetadata, completionSpanMetadata } = useSpanCompletionData({
    traceId: span.traceId,
    spanId: span.id,
  })

  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem label='Prompt id'>
            <ClickToCopy copyValue={span.metadata.promptUuid}>
              <Text.H5 align='right' color='foregroundMuted'>
                {span.metadata.promptUuid.slice(0, 8)}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
          {span.metadata.versionUuid && (
            <MetadataItem label='Version id'>
              <ClickToCopy copyValue={span.metadata.versionUuid}>
                <Text.H5 align='right' color='foregroundMuted'>
                  {span.metadata.versionUuid.slice(0, 8)}
                </Text.H5>
              </ClickToCopy>
            </MetadataItem>
          )}
          {span.metadata.name && (
            <MetadataItem label='Name'>
              <Text.H5 align='right' color='foregroundMuted'>
                {span.metadata.name}
              </Text.H5>
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
