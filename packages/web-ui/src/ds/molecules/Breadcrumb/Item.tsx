import type { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Skeleton } from '../../atoms/Skeleton'

export function BreadcrumbItem({
  children,
  noShrink,
}: {
  children: ReactNode
  noShrink?: boolean
}) {
  return (
    <li
      className={cn('flex flex-row items-center gap-4 overflow-hidden', {
        'flex-shrink-0': noShrink,
        'min-w-24': !noShrink,
      })}
    >
      {children}
    </li>
  )
}

export function BreadcrumbItemSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('w-32 h-8 rounded-md', className)} />
}
