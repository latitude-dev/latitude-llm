import { ReactNode } from 'react'

export function CommitItemsWrapper({ children }: { children?: ReactNode }) {
  return (
    <ul className='custom-scrollbar h-full border border-border rounded-lg divide-y divide-border'>
      {children}
    </ul>
  )
}
