import type { ReactNode } from 'react'

import { cn } from '../../../../lib/utils'

export function EditorWrapper({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-grow relative', className)}>
      <div className='absolute top-0 left-0 right-0 bottom-0'>{children}</div>
    </div>
  )
}
