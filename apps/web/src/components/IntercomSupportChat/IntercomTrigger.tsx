'use client'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { useIntercom } from '.'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'

export function IntercomTrigger() {
  const { open, unreadCount } = useIntercom()

  return (
    <Tooltip
      asChild
      trigger={
        <Button
          variant='ghost'
          className={cn('rounded-full h-8', {
            'p-0': unreadCount === 0,
            'bg-primary px-2': unreadCount > 0,
          })}
          iconProps={{
            name: 'headset',
            color: unreadCount > 0 ? 'white' : 'primary',
            size: 'medium',
          }}
          onClick={open}
        >
          {unreadCount > 0 && (
            <Badge variant='white' shape='rounded'>
              {unreadCount}
            </Badge>
          )}
        </Button>
      }
    >
      Chat with support
    </Tooltip>
  )
}
