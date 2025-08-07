import type { ReactNode } from 'react'
import { cn } from '@latitude-data/web-ui/utils'

export function ExperimentVariantWrapper({
  children,
  expand = false,
}: {
  children: ReactNode
  expand?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col relative gap-2 p-4 border border-border rounded-md min-w-[300px]',
        {
          'flex-1': expand,
        },
      )}
    >
      {children}
    </div>
  )
}
