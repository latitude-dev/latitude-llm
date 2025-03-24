import { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

type ContainerSize = 'xl' | '2xl'

export function Container({
  size = 'xl',
  children,
}: {
  size?: ContainerSize
  children: ReactNode
}) {
  return (
    <div
      className={cn('mx-auto w-full  py-6 px-4 flex flex-col gap-6', {
        'max-w-screen-xl': size === 'xl',
        'max-w-screen-2xl': size === '2xl',
      })}
    >
      {children}
    </div>
  )
}
