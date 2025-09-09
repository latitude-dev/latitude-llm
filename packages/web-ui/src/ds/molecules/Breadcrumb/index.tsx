import { ReactNode } from 'react'

export function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <ul className='flex flex-row flex-grow flex-shrink min-w-0 overflow-hidden items-center gap-2'>
      {children}
    </ul>
  )
}

export * from './Item'
export * from './Separator'
