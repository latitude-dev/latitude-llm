import { MetadataItem } from '$/components/MetadataItem'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import {
  DetailsPanelProps,
  SPAN_COLORS,
  SpanFrontendSpecification,
} from './shared'
import { AggregatedCompletionsDetails } from './shared/AggregatedCompletionsDetails'

const specification = SPAN_SPECIFICATIONS[SpanType.Chat]
export default {
  ...specification,
  icon: 'messageSquareText',
  color: SPAN_COLORS.blue,
  DetailsPanel: DetailsPanel,
} satisfies SpanFrontendSpecification<SpanType.Chat>

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Chat>) {
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
          <AggregatedCompletionsDetails span={span} />
        </>
      )}
    </>
  )
}
