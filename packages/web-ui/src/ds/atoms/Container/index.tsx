import { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

export type ContainerSize = 'xl' | '2xl' | 'full'

export function Container({
  size = 'xl',
  limitMaxHeight = false,
  children,
}: {
  size?: ContainerSize
  limitMaxHeight?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn('mx-auto w-full  py-6 px-4 flex flex-col gap-6', {
        'max-h-full': limitMaxHeight,
        'max-w-screen-xl': size === 'xl',
        'max-w-screen-2xl': size === '2xl',
      })}
    >
      {children}
    </div>
  )
}
