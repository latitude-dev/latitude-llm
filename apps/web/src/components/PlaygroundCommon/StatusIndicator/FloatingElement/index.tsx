import { cn } from '@latitude-data/web-ui/utils'
import { ReactNode } from 'react'

export function FloatingElement({
  isScrolledToBottom,
  children,
  spacing = 'normal',
}: {
  isScrolledToBottom: boolean
  children: ReactNode
  spacing?: 'small' | 'normal' | 'large'
}) {
  return (
    <div
      className={cn('absolute bg-background rounded-full flex flex-row gap-2', {
        'shadow-md': !isScrolledToBottom,
        '-top-10': spacing === 'small',
        '-top-12': spacing === 'normal',
        '-top-14': spacing === 'large',
      })}
    >
      {children}
    </div>
  )
}
