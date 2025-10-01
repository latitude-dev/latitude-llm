import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { SPAN_COLORS } from './shared'
import { MetadataItem } from '$/components/MetadataItem'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { DetailsPanelProps } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Prompt]

export default {
  ...specification,
  icon: 'bot' as IconName,
  color: SPAN_COLORS.gray,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Prompt>) {
  console.log(span)
  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem label='Version UUID'>
            <ClickToCopy
              copyValue={span.metadata.attributes.commitUuid as string}
            >
              <Text.H5 align='right' color='foregroundMuted'>
                {span.metadata.attributes.commitUuid}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
          {span.metadata.attributes.documentUuid && (
            <MetadataItem label='Prompt UUID'>
              <ClickToCopy
                copyValue={span.metadata.attributes.documentUuid as string}
              >
                <Text.H5 align='right' color='foregroundMuted'>
                  {span.metadata.attributes.documentUuid}
                </Text.H5>
              </ClickToCopy>
            </MetadataItem>
          )}
          {span.metadata.attributes.experimentUuid && (
            <MetadataItem label='Experiment UUID'>
              <ClickToCopy
                copyValue={span.metadata.attributes.experimentUuid as string}
              >
                <Text.H5 align='right' color='foregroundMuted'>
                  {span.metadata.attributes.experimentUuid}
                </Text.H5>
              </ClickToCopy>
            </MetadataItem>
          )}
        </>
      )}
    </>
  )
}
