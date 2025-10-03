import { MetadataItem } from '$/components/MetadataItem'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { DetailsPanelProps, SPAN_COLORS } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Prompt]
export default {
  ...specification,
  icon: 'bot' as IconName,
  color: SPAN_COLORS.gray,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Prompt>) {
  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem label='Version UUID'>
            <ClickToCopy
              copyValue={span.metadata.attributes.commitUuid as string}
            >
              <Text.H5 align='right' color='foregroundMuted'>
                {(span.metadata.attributes.commitUuid as string).slice(0, 8)}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
          {span.metadata.attributes.documentUuid && (
            <MetadataItem label='Prompt UUID'>
              <ClickToCopy
                copyValue={span.metadata.attributes.documentUuid as string}
              >
                <Text.H5 align='right' color='foregroundMuted'>
                  {(span.metadata.attributes.documentUuid as string).slice(
                    0,
                    8,
                  )}
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
                  {(span.metadata.attributes.experimentUuid as string).slice(
                    0,
                    8,
                  )}
                </Text.H5>
              </ClickToCopy>
            </MetadataItem>
          )}
        </>
      )}
    </>
  )
}
