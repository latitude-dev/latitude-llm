'use client'

import { ReactNode } from 'react'

import useMeasure from '$ui/lib/hooks/useMeasure'
import { useAppLayout } from '$ui/providers'

export default function DocumentSidebar({
  header,
  tree,
}: {
  header: ReactNode
  tree: ReactNode
}) {
  const { contentHeight } = useAppLayout()
  const [headerRef, { height: headerHeight, paddingY }] =
    useMeasure<HTMLDivElement>()
  const treeHeight = contentHeight - headerHeight + paddingY
  return (
    <aside
      className='flex flex-col gap-y-2 w-full overflow-y-hidden'
      suppressHydrationWarning
      style={{ height: contentHeight }}
    >
      <div ref={headerRef} className='p-4 gap-y-2'>
        {header}
      </div>
      <div
        className='flex-1 custom-scrollbar'
        suppressHydrationWarning
        style={{ height: treeHeight }}
      >
        {tree}
      </div>
    </aside>
  )
}
