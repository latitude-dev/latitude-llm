import { ReactNode } from 'react'

export function BlankSlate({ children }: { children: ReactNode }) {
  return (
    <div className='rounded-lg w-full py-40 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent px-4'>
      {children}
    </div>
  )
}
