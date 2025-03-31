import { ReactNode } from 'react'

import { cn } from '@latitude-data/web-ui/utils'

export function DocumentBlankSlateLayout({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-h-full', className)}>
      <div className='p-6 py-12 bg-backgroundCode border rounded-lg flex justify-center min-h-full'>
        <div className='flex flex-col items-center gap-8 max-w-3xl'>
          {children}
        </div>
      </div>
    </div>
  )
}
