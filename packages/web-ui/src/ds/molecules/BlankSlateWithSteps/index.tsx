import { ReactNode } from 'react'

import { Badge, Text } from '../../atoms'

export function BlankSlateStep({
  number,
  title,
  description,
  children,
}: {
  number: number
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className='max-w-md bg-background border border-border rounded-lg p-4 flex flex-col gap-4'>
      <div className='flex flex-row items-center gap-4'>
        <Badge variant='accent'>{number}</Badge>
        <Text.H5B>{title}</Text.H5B>
      </div>
      <Text.H5 color='foregroundMuted'>{description}</Text.H5>
      {children}
    </div>
  )
}

export function BlankSlateWithSteps({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className='rounded-lg w-full py-16 flex flex-col gap-4 items-center justify-center bg-gradient-to-b from-secondary to-transparent'>
      <div className='max-w-md flex flex-col items-center gap-2'>
        <Text.H4B>{title}</Text.H4B>
        <Text.H5 align='center' display='block' color='foregroundMuted'>
          {description}
        </Text.H5>
      </div>
      <div className='flex flex-row flex-wrap justify-center gap-12 px-8 pt-12'>
        {children}
      </div>
    </div>
  )
}
