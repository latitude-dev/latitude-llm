import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'

export function FloatingPanel({
  children,
  visible = true,
}: {
  children: ReactNode
  visible?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-card shadow-sm border-foreground/10',
        'bg-white/60 dark:bg-background/10 backdrop-blur backdrop-saturate-200',
        'pointer-events-auto',
        'transition-all transform duration-300 ease-in-out',
        {
          'translate-y-0 opacity-100 h-auto p-3 border': visible,
          'translate-y-full opacity-0 h-0 overflow-hidden': !visible,
        },
      )}
    >
      {children}
    </div>
  )
}
