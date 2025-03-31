import { ReactNode } from 'react'

import { cn } from '@latitude-data/web-ui/utils'

export function Container({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('container mx-auto max-w-chat', className)}>
      {children}
    </div>
  )
}
