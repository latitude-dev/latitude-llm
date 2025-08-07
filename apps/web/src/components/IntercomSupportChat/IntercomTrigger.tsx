'use client'

import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { ButtonWithBadge } from '@latitude-data/web-ui/molecules/ButtonWithBadge'
import { useIntercom } from '.'

export function IntercomTrigger() {
  const { open, unreadCount } = useIntercom()

  return (
    <ButtonWithBadge
      variant='ghost'
      className='p-0 bg-primary rounded-full w-8 h-8'
      iconProps={{
        name: 'intercomChat',
        color: 'white',
      }}
      onClick={open}
      badge={unreadCount > 0 && <Badge variant='accent'>{unreadCount}</Badge>}
      badgeAnchor='end'
      badgeClassName='-right-1'
    />
  )
}
