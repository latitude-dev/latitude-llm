import { HTMLAttributes } from 'react'

import { cn } from '../../../lib/utils'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-muted-foreground/10',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
