'use client'

import { useMemo } from 'react'

import { Message as ConversationMessage } from '@latitude-data/compiler'
import { TraceWithSpans } from '@latitude-data/core/browser'
import { Badge, MessageList, Text } from '@latitude-data/web-ui'

function getUniqueSpanAttributes(
  span: TraceWithSpans['spans'][0],
  attribute: string,
) {
  if (!span.attributes) return []
  const value = span.attributes[attribute]
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

export function TraceMessages({ trace }: { trace: TraceWithSpans }) {
  const messageGroups = useMemo(() => {
    const generationSpans = trace.spans.filter(
      (span) => span.internalType === 'generation',
    )

    return generationSpans
      .map((span) => {
        const spanMessages: ConversationMessage[] = []

        try {
          if (span.input) {
            const inputMessages = span.input as ConversationMessage[]
            spanMessages.push(...inputMessages)
          }

          if (span.output) {
            const outputMessages = span.output as ConversationMessage[]
            spanMessages.push(...outputMessages)
          }
        } catch (error) {
          console.error('Error parsing messages for span:', span.spanId, error)
        }

        const providers = getUniqueSpanAttributes(span, 'gen_ai.system')

        return {
          spanId: span.spanId,
          name: span.name,
          providers,
          models: [span.model],
          tools: span.toolCalls,
          messages: spanMessages,
        }
      })
      .filter((group) => group.messages.length > 0)
  }, [trace.spans])

  if (messageGroups.length === 0) return null

  return (
    <div className='flex flex-col gap-6 max-w-full'>
      {messageGroups.map((group, index) => (
        <div key={group.spanId} className='flex flex-col gap-2'>
          {index > 0 && <div className='h-px bg-border' />}
          <div className='flex flex-wrap items-center gap-2 px-2'>
            <Text.H6 color='foregroundMuted'>
              {group.name || 'Generation'}
            </Text.H6>
            <Text.H6 color='foregroundMuted'>·</Text.H6>
            <div className='flex flex-wrap gap-1'>
              {group.providers.map((provider) => (
                <Badge key={provider as string} variant='secondary'>
                  <Text.H6 noWrap>{provider}</Text.H6>
                </Badge>
              ))}
            </div>
            {group.models.length > 0 && (
              <>
                <Text.H6 color='foregroundMuted'>·</Text.H6>
                <div className='flex flex-wrap gap-1'>
                  {group.models.map((model) => (
                    <Badge key={model as string} variant='secondary'>
                      <Text.H6 noWrap>{model}</Text.H6>
                    </Badge>
                  ))}
                </div>
              </>
            )}
            {group.tools && group.tools.length > 0 && (
              <>
                <Text.H6 color='foregroundMuted'>·</Text.H6>
                <div className='flex flex-wrap gap-1'>
                  {group.tools.map((tool) => (
                    <Badge key={tool.name} variant='secondary'>
                      <Text.H6 noWrap>{tool.name}</Text.H6>
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>
          <MessageList messages={group.messages} />
        </div>
      ))}
    </div>
  )
}
