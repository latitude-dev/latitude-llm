'use client'

import { ReactNode } from 'react'

export default function DocumentSidebar({
  header,
  tree,
}: {
  header: ReactNode
  tree: ReactNode
}) {
  return (
    <aside className='flex flex-col gap-y-2 w-full h-full'>
      <div className='p-4 gap-y-2'>{header}</div>
      <div className='flex-1'>{tree}</div>
    </aside>
  )
}
