import { ReactNode } from 'react'
import { Button, ButtonProps } from '../../atoms/Button'
import { cn } from '../../../lib/utils'

export function ButtonWithBadge({
  badge,
  badgeAnchor = 'center',
  badgeClassName,
  ...buttonProps
}: {
  badge?: ReactNode
  badgeAnchor?: 'end' | 'center'
  badgeClassName?: string
} & ButtonProps) {
  return (
    <div className='relative'>
      <Button {...buttonProps} />
      <div
        className={cn(
          'absolute top-0 -translate-y-1/2 right-px',
          {
            'translate-x-1/2': badgeAnchor === 'center',
          },
          badgeClassName,
        )}
      >
        {badge}
      </div>
    </div>
  )
}
