import { ReactNode } from 'react'

export default function DocumentSidebar({
  header,
  tree,
}: {
  header: ReactNode
  tree: ReactNode
}) {
  return (
    <aside className='flex flex-col gap-y-2 w-full max-h-full overflow-y-hidden'>
      <div className='p-4 py-6 gap-y-2'>{header}</div>
      <div className='flex-1 custom-scrollbar'>{tree}</div>
    </aside>
  )
}
