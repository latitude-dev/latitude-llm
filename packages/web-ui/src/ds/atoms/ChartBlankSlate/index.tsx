import { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Text } from '../Text'

type Props = {
  children: ReactNode
  className?: string
}

export function ChartBlankSlate({ children, className }: Props) {
  return (
    <div
      className={cn(
        'p-2 rounded-lg w-full flex flex-col items-center justify-center bg-gradient-to-b from-secondary to-transparent h-full',
        className,
      )}
    >
      <Text.H6 color='foregroundMuted' centered>{children}</Text.H6>
    </div>
  )
}
