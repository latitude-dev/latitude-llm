import { ReactNode } from 'react'

export function DocumentBlankSlateLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className='min-h-full p-6'>
      <div className='p-6 bg-backgroundCode border rounded-lg flex min-h-full'>
        <div className='flex flex-col gap-6 max-w-3xl'>{children}</div>
      </div>
    </div>
  )
}
