import { memo, useMemo, useState } from 'react'
import { MessageProps } from '../types'
import { cn } from '@latitude-data/web-ui/utils'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Content } from '../Content'
import { ToolCardSkeleton } from '../Content/ToolCall/Skeleton'
import { Button } from '@latitude-data/web-ui/atoms/Button'

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
        className={cn('flex flex-col gap-1 w-full items-start py-2', {
          'animate-pulse': animatePulse,
        })}
      >
        <div>
          <Badge variant={roleVariant(role)}>{roleToString(role)}</Badge>
        </div>
        <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
          <div
            className='flex-shrink-0 bg-muted w-1 rounded-lg cursor-pointer hover:bg-primary transition-colors'
            onClick={() => setCollapseMessage(!collapsedMessage)}
          />
          <div className='flex flex-grow flex-col gap-1 overflow-x-auto'>
            {collapsedMessage ? (
              <Button variant='nope' onClick={() => setCollapseMessage(false)}>
                <Text.H6 color='foregroundMuted' noWrap ellipsis>
                  {contentsAsString}
                </Text.H6>
              </Button>
            ) : (
              <Content
                content={content}
                color='foregroundMuted'
                size={size}
                parameters={parameters}
                toolContentMap={toolContentMap}
                debugMode={true}
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
