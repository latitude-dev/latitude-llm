import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactNode } from 'react'

export function DocumentBlankSlateLayout({
  children,
  title,
  description,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className='min-h-full p-6'>
      <div className='p-6 py-12 bg-backgroundCode border rounded-lg flex justify-center min-h-full'>
        <div className='flex flex-col items-center gap-8 max-w-3xl'>
          <div className='flex flex-col gap-4 items-center'>
            <Text.H4M>{title}</Text.H4M>
            <Text.H5>{description}</Text.H5>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
