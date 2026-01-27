import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { memo, useState } from 'react'
import { Content } from '../Content'
import { ToolCardSkeleton } from '../Content/ToolCall/Skeleton'
import { MessageProps } from '../types'

const roleVariant = (role?: string) => {
  switch (role) {
    case 'user':
      return 'purple'
    case 'system':
      return 'outline'
    case 'assistant':
      return 'yellow'
    case 'tool':
      return 'secondary'
    default:
      return 'secondary'
  }
}

const roleToString = (role?: string) => {
  if (!role) return 'Unknown'
  if (role === 'tool') return 'Tool response'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export const DebugMessage = memo(
  ({
    role,
    content,
    animatePulse = false,
    size = 'default',
    parameters = [],
    toolContentMap,
    isGeneratingToolCall = false,
    messageIndex,
    isStreaming = false,
  }: Omit<MessageProps, 'debugMode'>) => {
    const [collapsedMessage, setCollapseMessage] = useState(false)

    return (
      <div
        className={cn('min-w-0 w-full flex flex-col gap-1 items-start py-2', {
          'animate-pulse': animatePulse,
        })}
      >
        <div>
          <Badge variant={roleVariant(role)}>{roleToString(role)}</Badge>
        </div>
        <div className='min-w-0 w-full flex flex-row gap-4 pl-4'>
          <div
            className='flex-shrink-0 bg-muted w-1 rounded-lg cursor-pointer hover:bg-primary transition-colors'
            onClick={() => setCollapseMessage(!collapsedMessage)}
          />
          <div className='flex-1 flex flex-col gap-1 min-w-0 overflow-hidden'>
            {collapsedMessage ? (
              <button
                className='block min-w-0'
                onClick={() => setCollapseMessage(false)}
              >
                <Text.H5 color='foregroundMuted' lineClamp={3}>
                  ...
                </Text.H5>
              </button>
            ) : (
              <Content
                debugMode
                content={content}
                color='foregroundMuted'
                size={size}
                parameters={parameters}
                toolContentMap={toolContentMap}
                markdownSize='sm'
                messageIndex={messageIndex}
                isStreaming={isStreaming}
              />
            )}
            {isGeneratingToolCall && <ToolCardSkeleton />}
          </div>
        </div>
      </div>
    )
  },
)
