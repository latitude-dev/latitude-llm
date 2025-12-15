import { memo, useMemo, useState } from 'react'
import { MessageProps } from '../types'
import { cn } from '@latitude-data/web-ui/utils'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Content } from '../Content'
import { ToolCardSkeleton } from '../Content/ToolCall/Skeleton'

const roleVariant = (role: string) => {
  switch (role) {
    case 'user':
      return 'purple'
    case 'system':
      return 'outline'
    case 'assistant':
      return 'yellow'
    case 'tool':
      return 'muted'
    default:
      return 'default'
  }
}

const roleToString = (role: string) => {
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
  }: Omit<MessageProps, 'debugMode'>) => {
    const [collapsedMessage, setCollapseMessage] = useState(false)
    const contentsAsString = useMemo(() => {
      if (typeof content === 'string') return content
      return content
        .map((c) => {
          if (c.type === 'text') return c.text
          return `[${c.type}]`
        })
        .join(' ')
    }, [content])

    return (
      <div
        className={cn('min-w-0 flex flex-col gap-1 items-start py-2', {
          'animate-pulse': animatePulse,
        })}
      >
        <div>
          <Badge variant={roleVariant(role)}>{roleToString(role)}</Badge>
        </div>
        <div className='min-w-0 flex flex-row gap-4 pl-4'>
          <div
            className='flex-shrink-0 bg-muted w-1 rounded-lg cursor-pointer hover:bg-primary transition-colors'
            onClick={() => setCollapseMessage(!collapsedMessage)}
          />
          <div className='flex flex-col gap-1 min-w-0'>
            {collapsedMessage ? (
              <button className='block min-w-0' onClick={() => setCollapseMessage(false)}>
                <Text.H6 color='foregroundMuted' lineClamp={3}>
                  {contentsAsString}
                </Text.H6>
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
              />
            )}
            {isGeneratingToolCall && <ToolCardSkeleton />}
          </div>
        </div>
      </div>
    )
  },
)
