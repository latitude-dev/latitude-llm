import type { ReactNode } from 'react'

import { cn } from '../../../lib/utils'
import { Badge } from '../../atoms/Badge'
import { Text } from '../../atoms/Text'
import { Skeleton } from '../../atoms/Skeleton'

export function BlankSlateStep({
  number,
  title,
  description,
  children,
  className,
}: {
  number: number
  title: string
  description: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'max-w-md bg-background border border-border rounded-lg p-4 flex flex-col gap-4',
        className,
      )}
    >
      <div className='flex flex-row items-center gap-4'>
        <Badge variant='accent'>{number}</Badge>
        <Text.H5B>{title}</Text.H5B>
      </div>
      <Text.H5 color='foregroundMuted'>{description}</Text.H5>
      {children}
    </div>
  )
}

export function BlankSlateStepSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'max-w-md bg-background border border-border rounded-lg p-4 flex flex-col gap-4',
        className,
      )}
    >
      <div className='flex flex-row items-center gap-4'>
        <Skeleton className='w-6 h-6 rounded-full' />
        <Skeleton className='w-32 h-6' />
      </div>
      <Skeleton className='w-full h-4' />
      <Skeleton className='w-3/4 h-4' />
      <div className='space-y-4'>
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className='flex flex-row items-center justify-between gap-4 p-4 rounded-lg'
          >
            <div className='flex flex-col gap-1 flex-grow'>
              <Skeleton className='w-3/4 h-5' />
              <Skeleton className='w-full h-4' />
            </div>
            <Skeleton className='w-32 h-9' />
          </div>
        ))}
      </div>
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
      <div className='flex flex-row flex-wrap justify-center gap-12 px-8 pt-12'>{children}</div>
    </div>
  )
}
