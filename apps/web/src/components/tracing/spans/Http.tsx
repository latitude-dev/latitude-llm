import { MetadataItem } from '$/components/MetadataItem'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { DetailsPanelProps, SPAN_COLORS } from './shared'
import { SPAN_SPECIFICATIONS, SpanType } from '@latitude-data/core/constants'

const specification = SPAN_SPECIFICATIONS[SpanType.Http]
export default {
  ...specification,
  icon: 'globe' as IconName,
  color: SPAN_COLORS.gray,
  DetailsPanel: DetailsPanel,
}

const CLIENT_STATUSES: Record<number, string> = {
  400: 'Bad request, check your parameters',
  401: 'Authentication required or failed',
  403: "Forbidden, you don't have permission",
  404: 'Resource not found',
  408: 'Request timed out',
  429: 'Too many requests, slow down',
}

const SERVER_STATUSES: Record<number, string> = {
  500: 'Server error, try again later',
  502: 'Bad gateway, invalid response from upstream',
  503: 'Service unavailable, server overloaded or down',
  504: 'Gateway timeout, upstream took too long',
}

function statusMessage(code: number) {
  if (code <= 199) return 'Informational response'
  if (code <= 299) return 'Request successful'
  if (code <= 399) return 'Action required'
  if (code <= 499) return CLIENT_STATUSES[code] ?? 'Client error'
  if (code <= 599) return SERVER_STATUSES[code] ?? 'Server error'
  return 'Unknown status code'
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Http>) {
  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem
            label='Request'
            contentClassName='pt-3 flex flex-col gap-y-3'
            stacked
          >
            <div className='w-full flex flex-col gap-y-1 whitespace-pre-wrap'>
              <Text.H6M>Endpoint</Text.H6M>
              <Text.H5 color='foregroundMuted' wordBreak='breakAll'>
                <Badge variant='outlineMuted'>
                  {span.metadata.request.method}
                </Badge>{' '}
                {span.metadata.request.url}
              </Text.H5>
            </div>
            <div className='w-full flex flex-col gap-y-1'>
              <Text.H6M>Headers</Text.H6M>
              <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
                <CodeBlock language='json'>
                  {JSON.stringify(span.metadata.request.headers, null, 2)}
                </CodeBlock>
              </div>
            </div>
            <div className='w-full flex flex-col gap-y-1'>
              <Text.H6M>Body</Text.H6M>
              {typeof span.metadata.request.body === 'string' ? (
                <TextArea
                  value={String(span.metadata.request.body || '')}
                  minRows={1}
                  maxRows={6}
                  disabled={true}
                />
              ) : (
                <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
                  <CodeBlock language='json'>
                    {JSON.stringify(span.metadata.request.body, null, 2)}
                  </CodeBlock>
                </div>
              )}
            </div>
          </MetadataItem>
          {!!span.metadata.response && (
            <>
              <MetadataItem
                label='Response'
                contentClassName='pt-3 flex flex-col gap-y-3'
                stacked
              >
                <div className='w-full flex flex-col gap-y-1 whitespace-pre-wrap'>
                  <Text.H6M>Status</Text.H6M>
                  <Text.H5 color='foregroundMuted' wordBreak='breakAll'>
                    <Badge variant='outlineMuted'>
                      {span.metadata.response.status.toString()}
                    </Badge>{' '}
                    {statusMessage(span.metadata.response.status)}
                  </Text.H5>
                </div>
                <div className='w-full flex flex-col gap-y-1'>
                  <Text.H6M>Headers</Text.H6M>
                  <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
                    <CodeBlock language='json'>
                      {JSON.stringify(span.metadata.response.headers, null, 2)}
                    </CodeBlock>
                  </div>
                </div>
                <div className='w-full flex flex-col gap-y-1'>
                  <Text.H6M>Body</Text.H6M>
                  {typeof span.metadata.response.body === 'string' ? (
                    <TextArea
                      value={String(span.metadata.response.body || '')}
                      minRows={1}
                      maxRows={6}
                      disabled={true}
                    />
                  ) : (
                    <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
                      <CodeBlock language='json'>
                        {JSON.stringify(span.metadata.response.body, null, 2)}
                      </CodeBlock>
                    </div>
                  )}
                </div>
              </MetadataItem>
            </>
          )}
        </>
      )}
    </>
  )
}
