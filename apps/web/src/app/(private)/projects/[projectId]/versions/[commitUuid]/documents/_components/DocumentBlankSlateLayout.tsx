import { ReactNode } from 'react'

export function DocumentBlankSlateLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className='min-h-full'>
      <div className='p-6 py-12 bg-backgroundCode border rounded-lg flex justify-center min-h-full'>
        <div className='flex flex-col items-center gap-8 max-w-3xl'>
          {children}
        </div>
      </div>
    </div>
  )
}
