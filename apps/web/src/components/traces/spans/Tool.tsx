import { MetadataItem } from '$/components/MetadataItem'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import {
  DetailsPanelProps,
  SPAN_COLORS,
  SpanFrontendSpecification,
} from './shared'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/constants'

const specification = SPAN_SPECIFICATIONS[SpanType.Tool]
export default {
  ...specification,
  icon: 'wrench',
  color: SPAN_COLORS.yellow,
  DetailsPanel: DetailsPanel,
} satisfies SpanFrontendSpecification<SpanType.Tool>

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Tool>) {
  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem label='Tool name' value={span.metadata.name} />
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
          {!!span.metadata.result &&
            (span.metadata.result.isError ? (
              <MetadataItem
                label='Error'
                color='destructiveMutedForeground'
                contentClassName='pt-2'
                stacked
              >
                <Alert
                  variant='destructive'
                  description={
                    typeof span.metadata.result.value !== 'string'
                      ? JSON.stringify(span.metadata.result.value, null, 2)
                      : String(span.metadata.result.value || 'Execution failed')
                  }
                />
              </MetadataItem>
            ) : (
              <MetadataItem label='Result' contentClassName='pt-2' stacked>
                {typeof span.metadata.result.value === 'string' ? (
                  <TextArea
                    value={String(span.metadata.result.value || '')}
                    minRows={1}
                    maxRows={6}
                    disabled={true}
                  />
                ) : (
                  <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
                    <CodeBlock language='json'>
                      {JSON.stringify(span.metadata.result.value, null, 2)}
                    </CodeBlock>
                  </div>
                )}
              </MetadataItem>
            ))}
        </>
      )}
    </>
  )
}
