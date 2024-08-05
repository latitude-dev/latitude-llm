'use client'

import { ReactNode } from 'react'

import useMeasure from '$ui/lib/hooks/useMeasure'

export default function DocumentSidebar({
  header,
  tree,
}: {
  header: ReactNode
  tree: ReactNode
}) {
  const [asideRef, { height: asideHeight }] = useMeasure<HTMLDivElement>()
  const [headerRef, { height: headerHeight }] = useMeasure<HTMLDivElement>()
  const treeHeight = `calc(${asideHeight}px - ${headerHeight}px)`
  return (
    <aside ref={asideRef} className='flex flex-col gap-y-2 w-full h-full'>
      <div ref={headerRef} className='p-4 gap-y-2'>
        {header}
      </div>
      <div className='flex-1 custom-scrollbar' style={{ height: treeHeight }}>
        {tree}
      </div>
    </aside>
  )
}
