import { MetadataItem } from '$/components/MetadataItem'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/constants'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { DetailsPanelProps, SPAN_COLORS } from './shared'
import { AggregatedCompletionsDetails } from './shared/AggregatedCompletionsDetails'

const specification = SPAN_SPECIFICATIONS[SpanType.External]
export default {
  ...specification,
  icon: 'externalLink' as IconName,
  color: SPAN_COLORS.blue,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.External>) {
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
          <AggregatedCompletionsDetails span={span} />
        </>
      )}
    </>
  )
}
