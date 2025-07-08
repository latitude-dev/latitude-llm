import { MetadataItem } from '$/components/MetadataItem'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/browser'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { DetailsPanelProps, SPAN_COLORS } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Tool]
export default {
  ...specification,
  icon: 'blocks' as IconName,
  color: SPAN_COLORS.green,
  DetailsPanel: DetailsPanel,
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Tool>) {
  return (
    <>
      {!!span.metadata?.name && (
        <MetadataItem label='Tool name' value={span.metadata.name} />
      )}
      {!!span.metadata?.call && (
        <>
          <MetadataItem label='Call id'>
            <ClickToCopy copyValue={span.metadata.call.id}>
              <Text.H5 align='right' color='foregroundMuted'>
                {span.metadata.call.id.slice(0, 8)}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
          <MetadataItem label='Arguments' contentClassName='pt-2' stacked>
            <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
              <CodeBlock language='json'>
                {JSON.stringify(span.metadata.call.arguments, null, 2)}
              </CodeBlock>
            </div>
          </MetadataItem>
        </>
      )}
      {!!span.metadata?.result &&
        (span.metadata.result.isError ? (
          <MetadataItem
            label='Error'
            color='destructiveMutedForeground'
            contentClassName='pt-2'
            stacked
          >
            <Alert
              variant='destructive'
              description={String(
                span.metadata.result.value || 'Tool execution failed',
              )}
            />
          </MetadataItem>
        ) : (
          <MetadataItem label='Result' contentClassName='pt-2' stacked>
            <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
              <CodeBlock language='json'>
                {JSON.stringify(span.metadata.result.value, null, 2)}
              </CodeBlock>
            </div>
          </MetadataItem>
        ))}
    </>
  )
}
