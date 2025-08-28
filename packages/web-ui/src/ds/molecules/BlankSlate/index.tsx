import { cn } from '@latitude-data/web-ui/utils'
import { ReactNode } from 'react'

export function BlankSlate({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent px-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
