'use client'
import { Badge, BadgeProps } from '@latitude-data/web-ui/atoms/Badge'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import { ReactNode, useState } from 'react'

export function MessageItem({
  children,
  badgeLabel,
  badgeVariant,
  badgeIcon,
  animatePulse = false,
}: {
  children: (renderProps: { collapsedMessage: boolean }) => ReactNode
  badgeLabel: string
  badgeVariant: BadgeProps['variant']
  badgeIcon?: IconName
  animatePulse?: boolean
}) {
  const [collapsedMessage, setCollapseMessage] = useState(false)
  return (
    <div
      className={cn('flex flex-col gap-1 w-full items-start', {
        'animate-pulse': animatePulse,
      })}
    >
      <div>
        <Badge variant={badgeVariant}>
          {badgeIcon && <Icon name={badgeIcon} size='small' className='mr-2' />}
          {badgeLabel}
        </Badge>
      </div>
      <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
        <div
          className='flex-shrink-0 bg-muted w-1 rounded-lg cursor-pointer hover:bg-primary transition-colors'
          onClick={() => setCollapseMessage(!collapsedMessage)}
        />
        <div className='flex flex-grow flex-col gap-1 overflow-x-auto'>
          {children({ collapsedMessage })}
        </div>
      </div>
    </div>
  )
}
