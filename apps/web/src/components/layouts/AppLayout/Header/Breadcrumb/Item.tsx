import { ReactNode } from 'react'

import { cn, Skeleton } from '@latitude-data/web-ui'

export function BreadcrumbSeparator() {
  return (
    <svg
      width={12}
      height={18}
      fill='none'
      className='stroke-current text-muted-foreground min-w-3'
    >
      <path
        strokeLinecap='round'
        strokeWidth={2}
        d='M1 17 11 1'
        opacity={0.5}
      />
    </svg>
  )
}

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
      <BreadcrumbSeparator />
      {children}
    </li>
  )
}

export function BreadcrumbItemSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('w-32 h-8 rounded-md', className)} />
}
