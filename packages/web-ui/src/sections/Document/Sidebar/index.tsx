'use client'

import { ReactNode } from 'react'

export default function DocumentSidebar({ children }: { children: ReactNode }) {
  return (
    <aside className='flex flex-col gap-y-2 w-full'>
      <div className='p-4 h-6'>HERE GOES FILE_TOOLBAR</div>
      {children}
    </aside>
  )
}
