import { ReactNode } from 'react'
import { cn } from '@latitude-data/web-ui/utils'

export function FloatingElement({
  isScrolledToBottom,
  children,
}: {
  isScrolledToBottom: boolean
  children: ReactNode
  topCssClass?: string
}) {
  return (
    <div
      className={cn(
        'absolute -top-12 bg-background rounded-full flex flex-row gap-2',
        {
          'shadow-md': !isScrolledToBottom,
        },
      )}
    >
      {children}
    </div>
  )
}
