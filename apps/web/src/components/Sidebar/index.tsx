import { ReactNode } from 'react'

export default function DocumentSidebar({
  header,
  tree,
  banner,
}: {
  header: ReactNode
  tree: ReactNode
  banner?: ReactNode
}) {
  return (
    <aside className='flex flex-col gap-y-4 w-full max-h-full overflow-y-hidden'>
      <div className='flex flex-col p-4'>
        {banner}
        {header}
      </div>
      <div className='flex-1 custom-scrollbar'>{tree}</div>
    </aside>
  )
}
