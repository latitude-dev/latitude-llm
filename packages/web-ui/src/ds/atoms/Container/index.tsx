import { ReactNode } from 'react'

export function Container({ children }: { children: ReactNode }) {
  return (
    <div className='mx-auto w-full max-w-screen-xl py-6 px-4 flex flex-col gap-6'>
      {children}
    </div>
  )
}
