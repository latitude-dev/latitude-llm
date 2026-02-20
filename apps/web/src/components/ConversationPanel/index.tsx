import { forwardRef, useMemo, useState } from 'react'
import DebugToggle from '$/components/DebugToggle'
import { MetadataInfoTabs } from '../MetadataInfoTabs'
import { MetadataItem } from '$/components/MetadataItem'
import { MessageList } from '$/components/ChatWrapper'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import {
  useConversation,
  useConversationEvaluations,
} from '$/stores/conversations'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { formatDuration } from '$/app/_lib/formatUtils'
import { format } from 'date-fns'
import { ConversationEvaluations } from './ConversationEvaluations'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

const CONVERSATION_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
  { label: 'Evaluations', value: 'evaluations' },
]

type Props = {
  documentLogUuid: string
  documentUuid: string
  commitUuid: string
}

export const ConversationPanel = forwardRef<HTMLDivElement, Props>(
  function ConversationPanel(
    { documentLogUuid, commitUuid, documentUuid },
    ref,
  ) {
    const { project } = useCurrentProject()
    const {
      messages,
      totalTokens,
      totalDuration,
      totalCost,
      traceCount,
      documentLogUuid: conversationId,
      promptName,
      parameters,
      startedAt,
      isLoading,
    } = useConversation({
      conversationId: documentLogUuid,
      projectId: project.id,
      commitUuid,
      documentUuid,
    })

    return (
      <MetadataInfoTabs ref={ref} tabs={CONVERSATION_TABS}>
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && (
              <ConversationMetadata
                isLoading={isLoading}
                traceCount={traceCount}
                totalTokens={totalTokens}
                totalDuration={totalDuration}
                totalCost={totalCost}
                conversationId={conversationId}
                commitUuid={commitUuid}
                promptName={promptName}
                parameters={parameters}
                startedAt={startedAt}
              />
            )}
            {selectedTab === 'messages' && (
              <ConversationMessages messages={messages} isLoading={isLoading} />
            )}
            {selectedTab === 'evaluations' && (
              <ConversationEvaluationsTab conversationId={documentLogUuid} />
            )}
          </>
        )}
      </MetadataInfoTabs>
    )
  },
)

function ConversationEvaluationsTab({
  conversationId,
}: {
  conversationId: string
}) {
  const { results, isLoading } = useConversationEvaluations({
    conversationId,
    enabled: true,
  })

  return (
    <ConversationEvaluations
      results={results}
      isLoading={isLoading}
      conversationId={conversationId}
    />
  )
}

function formatCost(costInMillicents: number): string {
  if (costInMillicents === 0) return '-'
  const dollars = costInMillicents / 100_000
  return `$${dollars.toFixed(4)}`
}

function ConversationMetadata({
  isLoading,
  traceCount,
  totalTokens,
  totalDuration,
  totalCost,
  conversationId,
  commitUuid,
  promptName,
  parameters,
  startedAt,
}: {
  isLoading: boolean
  traceCount: number
  totalTokens: number
  totalDuration: number
  totalCost: number
  conversationId: string | null
  commitUuid: string | null
  promptName: string | null
  parameters: Record<string, unknown> | null
  startedAt: string | null
}) {
  const formattedTimestamp = useMemo(() => {
    if (!startedAt) return null
    return format(new Date(startedAt), 'PPp')
  }, [startedAt])

  if (isLoading) return <LoadingText alignX='center' />

  return (
    <div className='flex flex-col gap-8'>
      <div className='w-full flex flex-col items-center gap-2'>
        {promptName && (
          <span className='w-full truncate'>
            <Text.H5M userSelect={false} noWrap ellipsis>
              {promptName}
            </Text.H5M>
          </span>
        )}
        <div className='w-full flex flex-row items-center gap-x-2'>
          <Badge variant='accent'>
            <span className='w-full flex flex-row items-center gap-x-2'>
              <Icon
                name='messagesSquare'
                size='xnormal'
                className='flex-shrink-0'
              />
              Conversation
            </span>
          </Badge>
        </div>
      </div>
      <div className='w-full flex flex-col gap-4'>
        {conversationId && (
          <MetadataItem label='Conversation id'>
            <ClickToCopy copyValue={conversationId}>
              <Text.H5 align='right' color='foregroundMuted'>
                {conversationId.slice(0, 8)}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
        )}
        {commitUuid && (
          <MetadataItem label='Version id'>
            <ClickToCopy copyValue={commitUuid}>
              <Text.H5 align='right' color='foregroundMuted'>
                {commitUuid.slice(0, 8)}
              </Text.H5>
            </ClickToCopy>
          </MetadataItem>
        )}
        {formattedTimestamp && (
          <MetadataItem label='Timestamp' value={formattedTimestamp} />
        )}
        <MetadataItem label='Traces' value={String(traceCount)} />
        <MetadataItem label='Duration' value={formatDuration(totalDuration)} />
        <MetadataItem label='Tokens' value={String(totalTokens)} />
        <MetadataItem label='Cost' value={formatCost(totalCost)} />
        <Text.H6 color='foregroundMuted'>
          Metrics are aggregated across all traces in this conversation.
        </Text.H6>
      </div>
      {parameters && Object.keys(parameters).length > 0 && (
        <div className='flex flex-col gap-y-1'>
          <Text.H5M color='foreground'>Parameters</Text.H5M>
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {Object.entries(parameters).map(([key, value], index) => {
              const displayValue =
                typeof value === 'string'
                  ? value
                  : JSON.stringify(value, null, 2)
              return (
                <div
                  key={index}
                  className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                >
                  <div className='flex flex-row items-center gap-x-2 min-h-8'>
                    <Badge variant='accent'>
                      &#123;&#123;{key}&#125;&#125;
                    </Badge>
                  </div>
                  <div className='flex flex-grow w-full min-w-0'>
                    <TextArea
                      value={String(displayValue || '')}
                      minRows={1}
                      maxRows={6}
                      disabled={true}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ConversationMessages({
  messages,
  isLoading,
}: {
  messages: any[]
  isLoading: boolean
}) {
  const [debugMode, setDebugMode] = useState(false)
  if (isLoading) {
    return <LoadingText alignX='center' />
  }

  if (!messages.length) {
    return (
      <div className='flex flex-row items-center justify-center w-full'>
        <Text.H6M color='foregroundMuted'>No messages</Text.H6M>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-4'>
      <ClientOnly className='flex flex-row items-end justify-end w-full'>
        <DebugToggle enabled={debugMode} setEnabled={setDebugMode} />
      </ClientOnly>
      <MessageList debugMode={debugMode} messages={messages} />
    </div>
  )
}
