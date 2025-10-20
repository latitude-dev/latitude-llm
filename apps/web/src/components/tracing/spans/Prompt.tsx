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
  console.log(span?.metadata?.parameters)

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
        </>
      )}
    </>
  )
}
