import { Text } from '@latitude-data/web-ui/atoms/Text'
import { BlankSlate } from '@latitude-data/web-ui/molecules/BlankSlate'
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
      <BlankSlate className='rounded-2xl'>
        <div className='flex flex-col items-center gap-8 max-w-3xl'>
          <div className='flex flex-col gap-4 items-center'>
            <Text.H4B color='foreground' centered>
              {title}
            </Text.H4B>
            <Text.H5 color='foregroundMuted' centered>
              {description}
            </Text.H5>
          </div>
          {children}
        </div>
      </BlankSlate>
    </div>
  )
}
