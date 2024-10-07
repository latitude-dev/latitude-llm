import { ReactNode } from 'react'

export function EditorWrapper({ children }: { children: ReactNode }) {
  return (
    <div className='flex flex-grow relative'>
      <div className='absolute top-0 left-0 right-0 bottom-0'>{children}</div>
    </div>
  )
}
