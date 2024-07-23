'use client'

import { ReactNode } from 'react'

export default function DocumentSidebar({ children }: { children: ReactNode }) {
  return (
    <aside className='flex flex-col gap-y-2 max-w-72 min-w-72 border-r border-b-border'>
      <div className='p-4 h-6'>HERE GOES FILE_TOOLBAR</div>
      {children}
    </aside>
  )
}
