import { ReactNode } from 'react'
import { Button, ButtonProps } from '../../atoms'

export function ButtonWithBadge({
  badge,
  ...buttonProps
}: {
  badge?: ReactNode
} & ButtonProps) {
  return (
    <div className='relative'>
      <Button {...buttonProps} />
      <div className='absolute top-0 right-0 translate-x-1/2 -translate-y-1/2'>
        {badge}
      </div>
    </div>
  )
}
